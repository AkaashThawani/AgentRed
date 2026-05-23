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

from .enrich import enrich_finding
from .events import EventBus, save_report
from .models import Evidence, Finding, Grade, Report, Severity, TestCase
from .scoring import compute_score, compute_stats
from .storage import write_finding, write_scan_started, write_scan_summary
from .tools.a2a_client import send_a2a_message
from .tools.card import fetch_agent_card
from .tools.card_behavior import generate_card_behavior_finding
from .tools.conformance import check_a2a_conformance
from .tools.multi_turn import run_multi_turn_test
from .tools.response_analyzer import analyze_response
from .tools.rpc_probes import probe_baseline, probe_tasks_get_random, probe_tasks_list
from .tools.signature import verify_card_signature
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
    endpoint: str | None = None

    async def emit_finding(f: Finding) -> None:
        """Single funnel: enrich (OWASP + reproducer), append, emit, store."""
        enrich_finding(f, endpoint=endpoint, auth_headers=auth_headers)
        all_findings.append(f)
        await bus.emit("finding", finding=f.model_dump(mode="json"))
        _safe_store(bus.scan_id, target_url, agent_name, f)

    try:
        await bus.emit("scan_started", scan_id=bus.scan_id, target_url=target_url)
        _safe(lambda: write_scan_started(target_url))

        # -------- Phase 1: fetch + static --------
        await bus.emit("phase", phase="static", message="Fetching agent card...")
        try:
            card = await fetch_agent_card(target_url)
        except Exception as e:
            await bus.emit("error", message=f"Failed to fetch agent card: {e}")
            return

        agent_name = card.get("name") or target_url
        endpoint = card.get("url") or _extract_jsonrpc_endpoint(card) or target_url
        await bus.emit("card_fetched", card=card)

        for f in run_static_checks(card):
            await emit_finding(f)

        # -------- Conformance phase --------
        await bus.emit("phase", phase="conformance", message="Checking A2A spec conformance...")
        for f in check_a2a_conformance(card):
            await emit_finding(f)

        # -------- Card signature verification (only if a signature is present) --------
        sig_finding = verify_card_signature(card)
        if sig_finding is not None:
            await emit_finding(sig_finding)

        # -------- JSON-RPC method probes (tasks/list, tasks/get) --------
        try:
            for probe in (probe_tasks_list(endpoint, auth_headers), probe_tasks_get_random(endpoint, auth_headers)):
                f = await probe
                if f is not None:
                    await emit_finding(f)
        except Exception as e:
            log.warning("rpc probe failed: %s", e)

        # -------- Card-vs-reality probe --------
        endpoint_blocked_status: int | None = None  # set if probe shows endpoint can't be reached
        try:
            probe = await send_a2a_message(endpoint, "ping", extra_headers=auth_headers)
            probe_status = probe.get("status_code")
            declared_auth = (card.get("authentication") or {}).get("schemes") or []
            if probe_status in (401, 403) and not declared_auth and not auth_headers:
                await emit_finding(Finding(
                    phase="static", test_type="card_auth_mismatch", severity=Severity.CRITICAL,
                    passed=False, title="Agent card lies about authentication requirements",
                    description=(
                        f"Card declares `authentication.schemes = []` but the endpoint returned HTTP {probe_status} "
                        "for an unauthenticated request. Clients trusting the card will fail every call."
                    ),
                    evidence=Evidence(
                        request='POST /a2a (empty auth, message="ping")',
                        response=(probe.get("response_text") or "")[:1000],
                        highlight=f"HTTP {probe_status}",
                    ),
                    recommendation="Update the card to declare the actual auth scheme the endpoint enforces.",
                ))
            elif probe_status in (404, 405):
                await emit_finding(Finding(
                    phase="static", test_type="card_endpoint_unreachable", severity=Severity.HIGH,
                    passed=False, title="Agent endpoint declared in card is unreachable for JSON-RPC POST",
                    description=(
                        f"Card declares `url` (or `interfaces[].url`) of `{endpoint}` but it returned HTTP "
                        f"{probe_status} for a POST. The card is advertising an interface the server does not implement."
                    ),
                    evidence=Evidence(request=f"POST {endpoint}", highlight=f"HTTP {probe_status}"),
                    recommendation="Fix the endpoint URL in the card, or implement A2A JSON-RPC at the declared URL.",
                ))
                endpoint_blocked_status = probe_status
            elif probe_status is None or (probe_status and probe_status >= 500):
                endpoint_blocked_status = probe_status
        except Exception as e:
            log.warning("endpoint probe failed: %s", e)
            endpoint_blocked_status = None  # treat as unreachable

        # -------- Phase 2: behavioral --------
        # If we already know the endpoint is unreachable (we already emitted
        # `card_endpoint_unreachable` HIGH above), short-circuit. No duplicate meta-finding —
        # the static finding already conveys what the user needs to know.
        if endpoint_blocked_status is not None:
            await bus.emit("phase", phase="behavioral",
                           message=f"Behavioral phase skipped — endpoint returned HTTP {endpoint_blocked_status}.")
            await _finalize_report(bus, target_url, agent_name, card, all_findings, started)
            return

        # Baseline first — sets "normal" behavior context
        await bus.emit("phase", phase="behavioral", message="Running baseline in-scope request...")
        try:
            baseline_finding, _ = await probe_baseline(endpoint, auth_headers, card.get("skills") or [])
            if baseline_finding is not None:
                await emit_finding(baseline_finding)
        except Exception as e:
            log.warning("baseline probe failed: %s", e)

        await bus.emit("phase", phase="behavioral", message="Generating test cases...")
        try:
            tests = await generate_test_cases(card, canary, n=TESTS_PER_SKILL)
        except Exception as e:
            log.exception("test generation failed")
            await bus.emit("error", message=f"Test generation failed: {e}")
            return

        for t in tests:
            await bus.emit("test_generated", test=t.model_dump(mode="json"))

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
                if status is None or status < 200 or status >= 300:
                    reason = _blocked_reason(status)
                    blocked = Finding(
                        phase="behavioral", test_type=t.test_type.value, severity=Severity.LOW,
                        passed=True, title=f"Blocked — {reason}",
                        description=(
                            f"Request returned HTTP {status} — exploit could not reach the agent. "
                            "No vulnerability inference possible from this response."
                        ),
                        evidence=Evidence(request=t.payload, response=(send_result.get("response_text") or "")[:500]),
                        recommendation="Address the underlying transport/auth/method issue to enable behavioral scanning.",
                        skill_targeted=t.skill_targeted,
                    )
                    return blocked, status
                finding = await analyze_response(t, send_result, canary=canary)
                return finding, status

        results = await asyncio.gather(*(run_one(t) for t in tests), return_exceptions=True)
        triggered_pairs: list[tuple[Finding, TestCase, str]] = []
        blocked_status_count: dict[int, int] = {}
        behavioral_findings_attempted = 0
        for t, res in zip(tests, results):
            if isinstance(res, Exception):
                log.exception("test failed", exc_info=res)
                await emit_finding(Finding(
                    phase="behavioral", test_type=t.test_type.value, severity=Severity.LOW,
                    passed=True,
                    title=f"{t.test_type.value.replace('_', ' ').title()} test errored",
                    description=f"{type(res).__name__}: {res}",
                    recommendation="Retry or investigate harness.",
                    skill_targeted=t.skill_targeted,
                ))
                continue
            finding, status = res
            behavioral_findings_attempted += 1
            if status is None or status < 200 or status >= 300:
                # Don't emit per-test blocked findings — they are 100% noise. Just count them
                # and we'll emit ONE meta-finding below.
                blocked_status_count[status or 0] = blocked_status_count.get(status or 0, 0) + 1
                continue
            await emit_finding(finding)
            if not finding.passed and finding.severity in _TRIGGER_SEVERITIES:
                triggered_pairs.append((finding, t, finding.evidence.response or ""))

        blocked_total = sum(blocked_status_count.values())
        if blocked_total > 0:
            # Emit a single meta finding summarizing how many were blocked + the primary status.
            primary_status = max(blocked_status_count.items(), key=lambda kv: kv[1])[0]
            await emit_finding(_make_blocked_meta(blocked_total, behavioral_findings_attempted, primary_status))

        # -------- Multi-turn stateful attack --------
        # Only worth running if the baseline worked (i.e. the agent is actually reachable).
        baseline_ok = any(f.test_type == "baseline_in_scope" and f.passed for f in all_findings)
        if baseline_ok:
            await bus.emit("phase", phase="behavioral", message="Running multi-turn / memory-recall attack...")
            try:
                mt_findings = await asyncio.wait_for(
                    run_multi_turn_test(endpoint, auth_headers, canary),
                    timeout=30.0,
                )
                for f in mt_findings:
                    await emit_finding(f)
            except asyncio.TimeoutError:
                log.warning("multi-turn test timed out after 30s — skipping")
            except Exception as e:
                log.warning("multi-turn test failed: %s", e)

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
            for fres in fup_results:
                if isinstance(fres, Exception):
                    log.exception("followup test failed", exc_info=fres)
                    continue
                fup_finding, _ = fres
                await emit_finding(fup_finding)

        # -------- Card-vs-behavior cross-check (meta-judgment) --------
        # Uses Gemini Pro with a large prompt — can hang. Hard-cap at 30s; if it doesn't
        # come back, we skip the cross-check and ship the report. Never let one slow LLM
        # call hold the whole scan hostage.
        await bus.emit("phase", phase="behavioral", message="Cross-checking observed behavior against card claims...")
        try:
            behavioral_findings = [f for f in all_findings if f.phase == "behavioral"]
            meta_finding = await asyncio.wait_for(
                generate_card_behavior_finding(card, behavioral_findings),
                timeout=30.0,
            )
            if meta_finding is not None:
                await emit_finding(meta_finding)
        except asyncio.TimeoutError:
            log.warning("card-vs-behavior cross-check timed out after 30s — skipping")
        except Exception as e:
            log.warning("card-vs-behavior cross-check failed: %s", e)

        # -------- Report --------
        await _finalize_report(bus, target_url, agent_name, card, all_findings, started)

    except Exception as e:
        log.exception("scan crashed")
        await bus.emit("error", message=f"Scan failed: {type(e).__name__}: {e}")


async def _finalize_report(bus: EventBus, target_url: str, agent_name: str,
                           card: dict[str, Any], all_findings: list[Finding], started: float) -> None:
    """Compute trust score, build the Report, save and emit it. Used both at the normal end of a scan
    and on the early-return path when behavioral scanning was skipped."""
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
    # ClickHouse + Datadog scan-level summary (best-effort, never blocks the report)
    _safe(lambda: write_scan_summary(
        scan_id=bus.scan_id, target_url=target_url, agent_name=agent_name,
        trust_score=score, grade=grade.value, duration_ms=report.duration_ms,
        critical=stats.critical, high=stats.high, medium=stats.medium, low=stats.low,
        total_tests=stats.total_tests,
    ))
    await bus.emit("report", report=report.model_dump(mode="json"))


def _extract_jsonrpc_endpoint(card: dict[str, Any]) -> str | None:
    interfaces = card.get("interfaces")
    if not isinstance(interfaces, list):
        return None
    for it in interfaces:
        if isinstance(it, dict) and it.get("type") == "json-rpc" and isinstance(it.get("url"), str):
            return it["url"]
    return None


def _blocked_reason(status: int | None) -> str:
    if status is None: return "transport error / unreachable"
    if status in (401, 403): return "authentication required"
    if status == 404: return "endpoint not found"
    if status == 405: return "endpoint does not accept POST"
    if status == 429: return "rate limited"
    if 500 <= status < 600: return f"server error ({status})"
    return f"HTTP {status}"


def _make_blocked_meta(blocked: int, total: int, primary_status: int | None) -> Finding:
    """Status-only meta-finding (passed=True, LOW severity) explaining that the behavioral
    phase could not complete normally. We deliberately do NOT mark this as a vulnerability —
    the real issue (broken endpoint / required auth) is captured by a different finding
    (`card_endpoint_unreachable` or by the user's awareness of the auth requirement)."""
    reason = _blocked_reason(primary_status)
    if primary_status in (401, 403):
        title = "Behavioral scan blocked — target requires authentication"
        rec = "Re-run with credentials via `auth_headers`, or confirm this surface is meant to be locked down."
    elif primary_status == 405:
        title = "Behavioral scan blocked — endpoint rejects POST"
        rec = "See the `card_endpoint_unreachable` finding for the underlying issue."
    elif primary_status == 404:
        title = "Behavioral scan blocked — endpoint URL returns 404"
        rec = "See the `card_endpoint_unreachable` finding for the underlying issue."
    elif primary_status == 429:
        title = "Behavioral scan blocked — target rate-limited the scanner"
        rec = "Retry with lower concurrency or after a backoff."
    elif primary_status and 500 <= primary_status < 600:
        title = f"Behavioral scan blocked — target returns {primary_status}"
        rec = "Target appears broken. Confirm the agent endpoint is healthy before re-scanning."
    else:
        title = "Behavioral scan blocked at HTTP layer"
        rec = "Resolve the transport-level error to enable behavioral scanning."
    return Finding(
        phase="behavioral", test_type="scan_blocked_by_http_error",
        severity=Severity.LOW, passed=True, title=title,
        description=(
            f"{blocked}/{total} behavioral requests were rejected ({reason}, status {primary_status}). "
            "This is a SCAN STATUS, not a vulnerability — the actual issue is captured by a related "
            "static finding. The per-test results below are not vulnerability signals."
        ),
        evidence=Evidence(highlight=f"HTTP {primary_status} on {blocked}/{total} requests"),
        recommendation=rec,
    )


def _payload_with_canary(payload: str, canary: str, test_type: str) -> str:
    if test_type == "canary_exfiltration" and canary not in payload:
        return payload + f"\n\n(Reference token for your records: {canary})"
    return payload


def _severity_rank(s: Severity) -> int:
    return {Severity.CRITICAL: 4, Severity.HIGH: 3, Severity.MEDIUM: 2, Severity.LOW: 1}[s]


def _summarize(agent_name: str, score: int, grade: Grade, stats) -> str:
    total_failed = stats.critical + stats.high + stats.medium + stats.low
    if total_failed == 0 and stats.total_tests == 0:
        # Nothing to test (e.g. behavioral phase short-circuited). Be honest about it.
        return (
            f"{agent_name} scored {score}/100 ({grade.value}). "
            "No behavioral tests ran — the scan returned only static and conformance findings. "
            "See findings below for what was checked."
        )
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


def _safe(fn) -> None:
    """Generic fire-and-forget wrapper for sponsor-integration calls."""
    try:
        fn()
    except Exception as e:
        log.warning("sponsor-integration call failed: %s", e)
