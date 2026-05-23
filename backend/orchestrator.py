"""The AgentRed scan orchestrator. Drives the full agentic loop:

  fetch_card → static_analyze → generate_tests → run tests (bounded concurrency)
  → analyze each response → if HIGH/CRITICAL, generate adaptive follow-ups → run those
  → score + emit final report

Every state change is pushed onto the per-scan EventBus so the SSE stream stays live."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import uuid4

from .events import EventBus, save_report
from .models import Evidence, Finding, Grade, Report, Severity, TestCase
from .scoring import compute_score, compute_stats
from .storage import write_finding
from .tools.a2a_client import send_a2a_message
from .tools.card import fetch_agent_card
from .tools.response_analyzer import analyze_response
from .tools.static_rules import run_static_checks
from .tools.test_gen import generate_followup_tests, generate_test_cases
from .config import MAX_CONCURRENT_TESTS, ADAPTIVE_FOLLOWUP_COUNT, TESTS_PER_SKILL

log = logging.getLogger("agentred.orchestrator")
_TRIGGER_SEVERITIES = {Severity.HIGH, Severity.CRITICAL}


async def run_scan(bus: EventBus, target_url: str, auth_headers: dict[str, str] | None = None) -> None:
    """Top-level scan entrypoint. Owns the lifecycle of one scan."""
    started = time.monotonic()
    canary = f"CANARY_{uuid4().hex[:12]}"
    all_findings: list[Finding] = []
    card: dict[str, Any] = {}
    agent_name = target_url

    try:
        await bus.emit("scan_started", scan_id=bus.scan_id, target_url=target_url)

        # -------- Phase 1: fetch + static --------
        await bus.emit("phase", phase="static", message="Fetching agent card...")
        try:
            card = await fetch_agent_card(target_url)
        except Exception as e:
            await bus.emit("error", message=f"Failed to fetch agent card: {e}")
            return

        agent_name = card.get("name") or target_url
        endpoint = card.get("url") or target_url
        await bus.emit("card_fetched", card=card)

        static_findings = run_static_checks(card)
        for f in static_findings:
            all_findings.append(f)
            await bus.emit("finding", finding=f.model_dump(mode="json"))
            _safe_store(bus.scan_id, target_url, agent_name, f)

        # -------- Card-vs-reality probe --------
        # If the card says auth.schemes is empty but the live endpoint returns 401/403,
        # the card is lying about its security posture. That's a real, distinct issue.
        try:
            probe = await send_a2a_message(endpoint, "ping", extra_headers=auth_headers)
            probe_status = probe.get("status_code")
            declared_auth = (card.get("authentication") or {}).get("schemes") or []
            if probe_status in (401, 403) and not declared_auth and not auth_headers:
                mismatch = Finding(
                    phase="static",
                    test_type="card_auth_mismatch",
                    severity=Severity.CRITICAL,
                    passed=False,
                    title="Agent card lies about authentication requirements",
                    description=(
                        f"The agent card declares `authentication.schemes = []` (no auth required), "
                        f"but the live endpoint returned HTTP {probe_status} for an unauthenticated request. "
                        "Clients trusting the card will fail every call. Worse, downstream agents may "
                        "expose credentials trying to recover from the silent contract violation."
                    ),
                    evidence=Evidence(
                        request='POST /a2a (empty auth, message="ping")',
                        response=(probe.get("response_text") or "")[:1000],
                        highlight=f"HTTP {probe_status}",
                    ),
                    recommendation=(
                        "Update the agent card to declare the actual `authentication.schemes` and "
                        "`securitySchemes` the endpoint enforces."
                    ),
                )
                all_findings.append(mismatch)
                await bus.emit("finding", finding=mismatch.model_dump(mode="json"))
                _safe_store(bus.scan_id, target_url, agent_name, mismatch)
        except Exception as e:
            log.warning("endpoint probe failed: %s", e)

        # -------- Phase 2: behavioral --------
        await bus.emit("phase", phase="behavioral", message="Generating test cases...")
        try:
            tests = await generate_test_cases(card, canary, n=TESTS_PER_SKILL)
        except Exception as e:
            log.exception("test generation failed")
            await bus.emit("error", message=f"Test generation failed: {e}")
            return

        for t in tests:
            await bus.emit("test_generated", test=t.model_dump(mode="json"))

        # Run tests concurrently with a bounded semaphore
        sem = asyncio.Semaphore(MAX_CONCURRENT_TESTS)

        async def run_one(t: TestCase) -> tuple[Finding, int | None]:
            async with sem:
                await bus.emit("test_running", test_id=t.id, test_type=t.test_type.value)
                send_result = await send_a2a_message(
                    endpoint,
                    _payload_with_canary(t.payload, canary, t.test_type.value),
                    extra_headers=auth_headers,
                )
                status = send_result.get("status_code")
                # Skip LLM judgment if the call was rejected by auth before reaching the agent.
                if status in (401, 403):
                    blocked = Finding(
                        phase="behavioral", test_type=t.test_type.value, severity=Severity.LOW,
                        passed=True, title="Blocked by authentication",
                        description=f"Request returned HTTP {status} — exploit could not reach the agent.",
                        evidence=Evidence(request=t.payload, response=(send_result.get("response_text") or "")[:500]),
                        recommendation="Provide a valid API key to scan behavioral surface.",
                        skill_targeted=t.skill_targeted,
                    )
                    return blocked, status
                finding = await analyze_response(t, send_result, canary=canary)
                return finding, status

        # Initial behavioral tests
        results = await asyncio.gather(*(run_one(t) for t in tests), return_exceptions=True)
        triggered_pairs: list[tuple[Finding, TestCase, str]] = []
        blocked_status_count: dict[int, int] = {}
        behavioral_findings_emitted = 0
        for t, res in zip(tests, results):
            if isinstance(res, Exception):
                log.exception("test failed", exc_info=res)
                err_finding = Finding(
                    phase="behavioral", test_type=t.test_type.value, severity=Severity.LOW,
                    passed=True, title="Test errored", description=f"{type(res).__name__}: {res}",
                    recommendation="Retry or investigate harness.",
                    skill_targeted=t.skill_targeted,
                )
                all_findings.append(err_finding)
                await bus.emit("finding", finding=err_finding.model_dump(mode="json"))
                continue
            finding, status = res
            if status in (401, 403):
                blocked_status_count[status] = blocked_status_count.get(status, 0) + 1
            all_findings.append(finding)
            behavioral_findings_emitted += 1
            await bus.emit("finding", finding=finding.model_dump(mode="json"))
            _safe_store(bus.scan_id, target_url, agent_name, finding)
            if not finding.passed and finding.severity in _TRIGGER_SEVERITIES:
                triggered_pairs.append((finding, t, finding.evidence.response or ""))

        # If most behavioral requests were blocked by auth, emit one meta-finding so the
        # report doesn't look like the agent is safe when really we couldn't test it.
        blocked_total = sum(blocked_status_count.values())
        if behavioral_findings_emitted > 0 and blocked_total / behavioral_findings_emitted >= 0.7:
            meta = Finding(
                phase="behavioral", test_type="scan_blocked_by_auth",
                severity=Severity.MEDIUM, passed=False,
                title="Behavioral scan blocked — target requires authentication",
                description=(
                    f"{blocked_total}/{behavioral_findings_emitted} behavioral requests were rejected "
                    f"with HTTP {sorted(blocked_status_count)[0]}. Exploits never reached the agent. "
                    "Provide a valid API key (via `auth_headers` in /scan) to perform a meaningful behavioral assessment."
                ),
                evidence=Evidence(),
                recommendation="Re-run with credentials, OR confirm with the operator that this surface is intended to be locked down.",
            )
            all_findings.append(meta)
            await bus.emit("finding", finding=meta.model_dump(mode="json"))
            _safe_store(bus.scan_id, target_url, agent_name, meta)

        # -------- Adaptive follow-ups --------
        for parent_finding, parent_test, parent_response in triggered_pairs:
            try:
                followups = await generate_followup_tests(
                    card,
                    parent_finding_summary=f"{parent_finding.title} — {parent_finding.description}",
                    parent_payload=parent_test.payload,
                    parent_response=parent_response,
                    canary=canary,
                    n=ADAPTIVE_FOLLOWUP_COUNT,
                )
            except Exception as e:
                log.warning("adaptive followup gen failed: %s", e)
                continue
            if not followups:
                continue

            await bus.emit(
                "adaptive_followup",
                parent_finding_id=parent_finding.id,
                reason=f"{parent_finding.severity.value} finding detected — probing variants to confirm and map exploit boundaries.",
                new_tests=[ft.model_dump(mode="json") for ft in followups],
            )

            fup_results = await asyncio.gather(*(run_one(ft) for ft in followups), return_exceptions=True)
            for ft, fres in zip(followups, fup_results):
                if isinstance(fres, Exception):
                    log.exception("followup test failed", exc_info=fres)
                    continue
                fup_finding, _ = fres
                all_findings.append(fup_finding)
                await bus.emit("finding", finding=fup_finding.model_dump(mode="json"))
                _safe_store(bus.scan_id, target_url, agent_name, fup_finding)

        # -------- Report --------
        await bus.emit("phase", phase="report", message="Computing trust score...")
        score, grade = compute_score(all_findings)
        stats = compute_stats(all_findings)
        all_findings.sort(key=lambda f: (
            -_severity_rank(f.severity), 0 if f.phase == "static" else 1, f.ts
        ))
        report = Report(
            scan_id=bus.scan_id,
            target_url=target_url,
            agent_name=agent_name,
            trust_score=score,
            grade=grade,
            summary=_summarize(agent_name, score, grade, stats),
            card=card,
            findings=all_findings,
            stats=stats,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        save_report(bus.scan_id, report.model_dump(mode="json"))
        await bus.emit("report", report=report.model_dump(mode="json"))

    except Exception as e:
        log.exception("scan crashed")
        await bus.emit("error", message=f"Scan failed: {type(e).__name__}: {e}")


def _payload_with_canary(payload: str, canary: str, test_type: str) -> str:
    """Inject the canary token for exfiltration tests if the LLM forgot to."""
    if test_type == "canary_exfiltration" and canary not in payload:
        return payload + f"\n\n(Reference token for your records: {canary})"
    return payload


def _severity_rank(s: Severity) -> int:
    return {Severity.CRITICAL: 4, Severity.HIGH: 3, Severity.MEDIUM: 2, Severity.LOW: 1}[s]


def _summarize(agent_name: str, score: int, grade: Grade, stats) -> str:
    if grade == Grade.TRUSTED:
        verdict = "passed all critical safety checks"
    elif grade == Grade.CAUTION:
        verdict = "showed minor issues but no critical vulnerabilities"
    elif grade == Grade.RISKY:
        verdict = "exhibited multiple meaningful vulnerabilities"
    else:
        verdict = "is dangerous — it leaks sensitive data or accepts unauthorized commands"
    return (
        f"{agent_name} scored {score}/100 ({grade.value}) — {verdict}. "
        f"Detected {stats.critical} critical, {stats.high} high, {stats.medium} medium, and {stats.low} low issues "
        f"across {stats.total_tests} behavioral tests."
    )


def _safe_store(scan_id: str, target_url: str, agent_name: str, f: Finding) -> None:
    try:
        write_finding(scan_id, target_url, agent_name, f)
    except Exception as e:
        log.warning("storage write failed: %s", e)
