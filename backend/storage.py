"""ClickHouse + Datadog sponsor integrations.

ClickHouse holds two append-only tables:
  - `agent_findings`  — every finding from every scan (audit log)
  - `agent_scans`     — one row per completed scan with the final trust score
                        (powers the historical leaderboard / `/history` endpoint)

Datadog receives metrics over the HTTP API (no local agent required, so it works
on Render or anywhere). Every scan emits:
  - `agentred.scan.started` (count) — tags: target
  - `agentred.scan.completed` (count) — tags: target, grade
  - `agentred.scan.trust_score` (gauge) — tags: target, grade
  - `agentred.scan.duration_ms` (histogram) — tags: target
  - `agentred.finding.emitted` (count) — tags: phase, severity, test_type
  - `agentred.test.pass` / `agentred.test.fail` (count) — tags: test_type, severity

All failures are logged and swallowed — sponsor integrations must NEVER take down a scan."""
from __future__ import annotations

import logging
import time
from typing import Any

from . import config
from .models import Finding

log = logging.getLogger("agentred.storage")

_clickhouse_client: Any = None
_datadog_initialized = False


# ---------------------------------------------------------------------------
# ClickHouse
# ---------------------------------------------------------------------------
def _maybe_init_clickhouse() -> Any | None:
    global _clickhouse_client
    if _clickhouse_client is not None:
        return _clickhouse_client
    if not config.CLICKHOUSE_URL:
        return None
    try:
        import clickhouse_connect  # type: ignore

        # ClickHouse Cloud gives you a hostname like `abc.us-east-2.aws.clickhouse.cloud`.
        # Be tolerant: also accept `https://...`, `host:port`, or `http://host` for local.
        raw = config.CLICKHOUSE_URL.strip().rstrip("/")
        is_http = raw.startswith("http://")
        # Strip scheme
        host = raw.replace("https://", "").replace("http://", "")
        # Extract explicit port if user gave one
        port: int
        if ":" in host:
            host, port_str = host.rsplit(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                port = 8123 if is_http else 8443
        else:
            port = 8123 if is_http else 8443
        secure = not is_http

        _clickhouse_client = clickhouse_connect.get_client(
            host=host,
            port=port,
            username=config.CLICKHOUSE_USER,
            password=config.CLICKHOUSE_PASSWORD,
            database=config.CLICKHOUSE_DATABASE,
            secure=secure,
        )
        # Findings audit log — every emitted finding goes here.
        _clickhouse_client.command("""
            CREATE TABLE IF NOT EXISTS agent_findings (
                scan_id String,
                timestamp DateTime DEFAULT now(),
                target_url String,
                agent_name String,
                phase String,
                test_type String,
                severity Enum8('LOW'=1, 'MEDIUM'=2, 'HIGH'=3, 'CRITICAL'=4),
                passed UInt8,
                title String,
                description String,
                evidence String,
                recommendation String,
                owasp_id String,
                skill_targeted String
            ) ENGINE = MergeTree() ORDER BY (timestamp, target_url)
        """)
        # Scan-level summary table — one row per completed scan. Powers the leaderboard.
        _clickhouse_client.command("""
            CREATE TABLE IF NOT EXISTS agent_scans (
                scan_id String,
                timestamp DateTime DEFAULT now(),
                target_url String,
                agent_name String,
                trust_score UInt8,
                grade Enum8('DANGEROUS'=1, 'RISKY'=2, 'CAUTION'=3, 'TRUSTED'=4),
                duration_ms UInt32,
                critical UInt16,
                high UInt16,
                medium UInt16,
                low UInt16,
                total_tests UInt16
            ) ENGINE = MergeTree() ORDER BY (timestamp, target_url)
        """)
        log.info("ClickHouse connected: host=%s port=%d secure=%s db=%s (tables ensured)",
                 host, port, secure, config.CLICKHOUSE_DATABASE)
        return _clickhouse_client
    except Exception as e:
        log.warning("ClickHouse init failed (host=%s): %s", config.CLICKHOUSE_URL, e)
        _clickhouse_client = None
        return None


def write_finding(scan_id: str, target_url: str, agent_name: str, finding: Finding) -> None:
    """Append a single finding to ClickHouse + emit Datadog metric."""
    ch = _maybe_init_clickhouse()
    if ch is not None:
        try:
            owasp_id = finding.owasp_llm.id if finding.owasp_llm else ""
            ch.insert(
                "agent_findings",
                [[
                    scan_id, target_url, agent_name, finding.phase, finding.test_type,
                    finding.severity.value, 1 if finding.passed else 0,
                    finding.title, finding.description,
                    (finding.evidence.model_dump_json() if finding.evidence else "{}"),
                    finding.recommendation, owasp_id,
                    finding.skill_targeted or "",
                ]],
                column_names=[
                    "scan_id", "target_url", "agent_name", "phase", "test_type",
                    "severity", "passed", "title", "description", "evidence",
                    "recommendation", "owasp_id", "skill_targeted",
                ],
            )
        except Exception as e:
            log.warning("ClickHouse insert failed: %s", e)

    _emit_datadog_metric(
        "agentred.finding.emitted", value=1, mtype="count",
        tags=[
            f"phase:{finding.phase}",
            f"severity:{finding.severity.value}",
            f"test_type:{finding.test_type}",
            f"passed:{str(finding.passed).lower()}",
        ],
    )
    _emit_datadog_metric(
        "agentred.test.pass" if finding.passed else "agentred.test.fail",
        value=1, mtype="count",
        tags=[f"severity:{finding.severity.value}", f"test_type:{finding.test_type}"],
    )


def write_scan_summary(scan_id: str, target_url: str, agent_name: str,
                       trust_score: int, grade: str, duration_ms: int,
                       critical: int, high: int, medium: int, low: int,
                       total_tests: int) -> None:
    """Append one row to `agent_scans` when a scan completes + emit scan-level Datadog metrics."""
    ch = _maybe_init_clickhouse()
    if ch is not None:
        try:
            ch.insert(
                "agent_scans",
                [[scan_id, target_url, agent_name, trust_score, grade,
                  duration_ms, critical, high, medium, low, total_tests]],
                column_names=[
                    "scan_id", "target_url", "agent_name", "trust_score", "grade",
                    "duration_ms", "critical", "high", "medium", "low", "total_tests",
                ],
            )
        except Exception as e:
            log.warning("ClickHouse scan-summary insert failed: %s", e)

    _emit_datadog_metric("agentred.scan.completed", value=1, mtype="count",
                         tags=[f"target:{target_url}", f"grade:{grade}"])
    _emit_datadog_metric("agentred.scan.trust_score", value=float(trust_score), mtype="gauge",
                         tags=[f"target:{target_url}", f"grade:{grade}"])
    _emit_datadog_metric("agentred.scan.duration_ms", value=float(duration_ms), mtype="histogram",
                         tags=[f"target:{target_url}", f"grade:{grade}"])


def write_scan_started(target_url: str) -> None:
    """Datadog-only event marking scan kickoff. Lets dashboards build started/completed funnels."""
    _emit_datadog_metric("agentred.scan.started", value=1, mtype="count",
                         tags=[f"target:{target_url}"])


def query_history(target_url: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Return historical scan summaries from ClickHouse, newest first.
    Filter by `target_url` if provided. Empty list if ClickHouse not configured."""
    ch = _maybe_init_clickhouse()
    if ch is None:
        return []
    try:
        if target_url:
            rows = ch.query(
                "SELECT scan_id, toUnixTimestamp(timestamp) AS ts, target_url, agent_name, "
                "trust_score, grade, duration_ms, critical, high, medium, low, total_tests "
                "FROM agent_scans WHERE target_url = {url:String} "
                "ORDER BY timestamp DESC LIMIT {limit:UInt32}",
                parameters={"url": target_url, "limit": limit},
            )
        else:
            rows = ch.query(
                "SELECT scan_id, toUnixTimestamp(timestamp) AS ts, target_url, agent_name, "
                "trust_score, grade, duration_ms, critical, high, medium, low, total_tests "
                "FROM agent_scans ORDER BY timestamp DESC LIMIT {limit:UInt32}",
                parameters={"limit": limit},
            )
        cols = rows.column_names
        return [dict(zip(cols, row)) for row in rows.result_rows]
    except Exception as e:
        log.warning("ClickHouse history query failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Datadog — HTTP API (no local agent required)
# ---------------------------------------------------------------------------
def _maybe_init_datadog() -> bool:
    global _datadog_initialized
    if _datadog_initialized:
        return True
    if not config.DATADOG_API_KEY:
        return False
    try:
        from datadog import initialize  # type: ignore
        initialize(
            api_key=config.DATADOG_API_KEY,
            app_key=config.DATADOG_APP_KEY or None,
            api_host=f"https://api.{config.DATADOG_SITE}",
        )
        _datadog_initialized = True
        log.info("Datadog initialized: site=%s", config.DATADOG_SITE)
        return True
    except Exception as e:
        log.warning("Datadog init failed: %s", e)
        return False


def _emit_datadog_metric(name: str, *, value: float, mtype: str, tags: list[str]) -> None:
    """Send a single metric to Datadog via the HTTP API. Quiet on failure."""
    if not _maybe_init_datadog():
        return
    try:
        from datadog import api  # type: ignore
        # api.Metric.send is non-blocking but synchronous. Add a global default tag
        # so all AgentRed metrics are filterable.
        all_tags = ["service:agentred"] + tags
        api.Metric.send(
            metric=name,
            points=[(int(time.time()), value)],
            type=mtype,
            tags=all_tags,
        )
    except Exception as e:
        log.debug("Datadog metric emit failed (%s): %s", name, e)
