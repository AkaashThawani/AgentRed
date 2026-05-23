"""Best-effort writes to ClickHouse and Datadog. All failures are logged and swallowed —
storage hiccups must NOT break a scan or break the SSE stream."""
from __future__ import annotations

import logging
from typing import Any

from . import config
from .models import Finding

log = logging.getLogger("agentred.storage")

_clickhouse_client: Any = None
_datadog_initialized = False


def _maybe_init_clickhouse() -> Any | None:
    global _clickhouse_client
    if _clickhouse_client is not None:
        return _clickhouse_client
    if not config.CLICKHOUSE_URL:
        return None
    try:
        import clickhouse_connect  # type: ignore
        _clickhouse_client = clickhouse_connect.get_client(
            host=config.CLICKHOUSE_URL,
            username=config.CLICKHOUSE_USER,
            password=config.CLICKHOUSE_PASSWORD,
            database=config.CLICKHOUSE_DATABASE,
            secure=config.CLICKHOUSE_URL.startswith("https") or True,
        )
        # Ensure table exists (idempotent).
        _clickhouse_client.command("""
            CREATE TABLE IF NOT EXISTS agent_findings (
                scan_id String,
                timestamp DateTime DEFAULT now(),
                target_url String,
                agent_name String,
                phase Enum8('static'=1, 'behavioral'=2),
                test_type String,
                severity Enum8('LOW'=1, 'MEDIUM'=2, 'HIGH'=3, 'CRITICAL'=4),
                passed UInt8,
                title String,
                description String,
                evidence String,
                recommendation String
            ) ENGINE = MergeTree() ORDER BY (timestamp, target_url)
        """)
        return _clickhouse_client
    except Exception as e:
        log.warning("ClickHouse init failed: %s", e)
        return None


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
        return True
    except Exception as e:
        log.warning("Datadog init failed: %s", e)
        return False


def write_finding(scan_id: str, target_url: str, agent_name: str, finding: Finding) -> None:
    """Fire-and-forget: write the finding to ClickHouse and emit a Datadog metric."""
    ch = _maybe_init_clickhouse()
    if ch is not None:
        try:
            ch.insert(
                "agent_findings",
                [[
                    scan_id, target_url, agent_name, finding.phase, finding.test_type,
                    finding.severity.value, 1 if finding.passed else 0,
                    finding.title, finding.description,
                    (finding.evidence.model_dump_json() if finding.evidence else "{}"),
                    finding.recommendation,
                ]],
                column_names=[
                    "scan_id", "target_url", "agent_name", "phase", "test_type",
                    "severity", "passed", "title", "description", "evidence", "recommendation",
                ],
            )
        except Exception as e:
            log.warning("ClickHouse insert failed: %s", e)

    if _maybe_init_datadog():
        try:
            from datadog import statsd  # type: ignore
            tags = [
                f"phase:{finding.phase}",
                f"severity:{finding.severity.value}",
                f"test_type:{finding.test_type}",
                f"agent:{agent_name}",
            ]
            metric = "agentred.test.pass" if finding.passed else "agentred.test.fail"
            statsd.increment(metric, tags=tags)
            statsd.increment("agentred.finding.severity", tags=tags)
        except Exception as e:
            log.warning("Datadog emit failed: %s", e)
