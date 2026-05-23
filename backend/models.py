"""Pydantic models — must stay in sync with CONTRACT.md."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid4())


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Grade(str, Enum):
    TRUSTED = "TRUSTED"
    CAUTION = "CAUTION"
    RISKY = "RISKY"
    DANGEROUS = "DANGEROUS"


class TestType(str, Enum):
    PROMPT_INJECTION = "prompt_injection"
    SCOPE_ESCAPE = "scope_escape"
    CANARY_EXFIL = "canary_exfiltration"
    ERROR_DISCLOSURE = "error_disclosure"
    ROLE_CONFUSION = "role_confusion"
    PII_PROBE = "pii_probe"
    CAPABILITY_OVERSTEP = "capability_overstep"


class Evidence(BaseModel):
    request: Optional[str] = None
    response: Optional[str] = None
    highlight: Optional[str] = None


class Finding(BaseModel):
    id: str = Field(default_factory=_uid)
    phase: Literal["static", "behavioral"]
    test_type: str
    severity: Severity
    passed: bool
    title: str
    description: str
    evidence: Evidence = Field(default_factory=Evidence)
    recommendation: str
    skill_targeted: Optional[str] = None
    ts: str = Field(default_factory=_now)


class TestCase(BaseModel):
    id: str = Field(default_factory=_uid)
    test_type: TestType
    payload: str
    what_to_watch: str
    severity_if_triggered: Severity
    skill_targeted: str = "global"


class ReportStats(BaseModel):
    # Behavioral test outcomes
    total_tests: int = 0       # behavioral tests fired (incl. adaptive follow-ups)
    passed: int = 0            # behavioral tests where exploit did NOT succeed
    failed: int = 0            # behavioral tests where exploit DID succeed
    # Static analysis outcomes
    static_findings: int = 0   # static checks that flagged an issue
    # Severity breakdown across ALL non-passing findings (both phases)
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class Report(BaseModel):
    scan_id: str
    target_url: str
    agent_name: str
    trust_score: int
    grade: Grade
    summary: str
    card: dict[str, Any]
    findings: list[Finding]
    stats: ReportStats
    duration_ms: int
    ts: str = Field(default_factory=_now)


class ScanRequest(BaseModel):
    target_url: str
    auth_headers: dict[str, str] | None = None  # e.g. {"X-Agent-Api-Key": "..."} or {"Authorization": "Bearer ..."}


class ScanResponse(BaseModel):
    scan_id: str
    stream_url: str
