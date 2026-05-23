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
from .models import Finding, Grade, Report, Severity, TestCase
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


async def run_scan(bus: EventBus, target_url: str) -> None:
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

        async def run_one(t: TestCase) -> Finding:
            async with sem:
                await bus.emit("test_running", test_id=t.id, test_type=t.test_type.value)
                send_result = await send_a2a_message(endpoint, _payload_with_canary(t.payload, canary, t.test_type.value))
                finding = await analyze_response(t, send_result, canary=canary)
                return finding

        # Initial behavioral tests
        results = await asyncio.gather(*(run_one(t) for t in tests), return_exceptions=True)
        triggered_pairs: list[tuple[Finding, TestCase, str]] = []
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
            all_findings.append(res)
            await bus.emit("finding", finding=res.model_dump(mode="json"))
            _safe_store(bus.scan_id, target_url, agent_name, res)
            if not res.passed and res.severity in _TRIGGER_SEVERITIES:
                triggered_pairs.append((res, t, res.evidence.response or ""))

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
                all_findings.append(fres)
                await bus.emit("finding", finding=fres.model_dump(mode="json"))
                _safe_store(bus.scan_id, target_url, agent_name, fres)

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
