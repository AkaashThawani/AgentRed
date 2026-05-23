"""A2A agent card spec conformance checks.

Walks the fetched card against required/recommended fields from the A2A v0.3 spec and
emits structured Findings for violations. Distinct from `static_rules.py`:
- static_rules: security postures (auth, signature, scope clarity)
- conformance: spec-correctness (required fields, types, structure)"""
from __future__ import annotations

import re
from typing import Any

from ..models import Evidence, Finding, Severity

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+([-+].+)?$")
_PROTO_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+([-+].+)?$")
_VALID_INTERFACE_TYPES = {"json-rpc", "grpc", "http+json", "rest"}


def _v(test_type: str, severity: Severity, title: str, description: str,
       recommendation: str, evidence: Evidence | None = None) -> Finding:
    return Finding(
        phase="conformance", test_type=test_type, severity=severity, passed=False,
        title=title, description=description, evidence=evidence or Evidence(),
        recommendation=recommendation,
    )


def check_a2a_conformance(card: dict[str, Any]) -> list[Finding]:
    """Return zero-or-more A2A spec violation findings."""
    out: list[Finding] = []

    # Required top-level fields per spec
    for field in ("name", "description"):
        if not isinstance(card.get(field), str) or not card.get(field, "").strip():
            out.append(_v(
                "a2a_spec_violation", Severity.MEDIUM,
                f"Required field `{field}` missing or empty",
                f"A2A spec requires top-level `{field}` to be a non-empty string.",
                f"Add a non-empty `{field}` to the agent card.",
            ))

    # url OR interfaces[].url must exist (one is required)
    has_url = isinstance(card.get("url"), str) and card.get("url", "").strip()
    interfaces = card.get("interfaces")
    has_iface_url = (
        isinstance(interfaces, list)
        and any(isinstance(it, dict) and isinstance(it.get("url"), str) for it in interfaces)
    )
    if not has_url and not has_iface_url:
        out.append(_v(
            "a2a_spec_violation", Severity.HIGH,
            "Card declares no callable URL",
            "A2A spec requires either a top-level `url` or `interfaces[].url`. Neither is present.",
            "Add a top-level `url` or at least one `interfaces[].url`.",
        ))

    # protocolVersion: optional but if present should be SemVer
    pv = card.get("protocolVersion")
    if pv is not None and not (isinstance(pv, str) and _PROTO_VERSION_RE.match(pv)):
        out.append(_v(
            "a2a_spec_violation", Severity.LOW,
            "`protocolVersion` is not SemVer",
            f"Value `{pv!r}` is not a valid SemVer string. The spec expects MAJOR.MINOR.PATCH.",
            "Set `protocolVersion` to a valid SemVer (e.g. `0.3.0`).",
        ))

    # version: required, must be SemVer per A2A v0.3
    ver = card.get("version")
    if ver is None:
        out.append(_v(
            "a2a_spec_violation", Severity.LOW,
            "Required field `version` missing",
            "A2A spec requires the `version` field.",
            "Add a SemVer `version` (e.g. `1.0.0`).",
        ))
    elif not (isinstance(ver, str) and _SEMVER_RE.match(ver)):
        out.append(_v(
            "a2a_spec_violation", Severity.LOW,
            "`version` is not SemVer-compliant",
            f"Value `{ver!r}` is not a valid SemVer.",
            "Use MAJOR.MINOR.PATCH format.",
            Evidence(highlight=f'"version": "{ver}"'),
        ))

    # capabilities: should be an object if present
    caps = card.get("capabilities")
    if caps is not None and not isinstance(caps, dict):
        out.append(_v(
            "a2a_spec_violation", Severity.LOW,
            "`capabilities` is not an object",
            "Spec requires `capabilities` to be a JSON object with boolean fields.",
            "Use an object like `{ \"streaming\": true, \"pushNotifications\": false }`.",
        ))

    # interfaces[].type must be a known transport
    if isinstance(interfaces, list):
        for i, it in enumerate(interfaces):
            if not isinstance(it, dict):
                continue
            t = it.get("type")
            if not isinstance(t, str):
                out.append(_v(
                    "a2a_spec_violation", Severity.LOW,
                    f"`interfaces[{i}].type` missing or not a string",
                    "Each interface must declare a `type` string (e.g. 'json-rpc').",
                    "Add a `type` field to every interface entry.",
                ))
                continue
            if t not in _VALID_INTERFACE_TYPES:
                out.append(_v(
                    "a2a_spec_violation", Severity.LOW,
                    f"`interfaces[{i}].type = {t!r}` is non-standard",
                    f"Spec-recognized transports include {sorted(_VALID_INTERFACE_TYPES)}.",
                    "Use a standard transport type or document the custom one.",
                ))

    # skills: each skill needs id + name
    skills = card.get("skills")
    if isinstance(skills, list):
        seen_ids: set[str] = set()
        for i, s in enumerate(skills):
            if not isinstance(s, dict):
                out.append(_v(
                    "a2a_spec_violation", Severity.LOW,
                    f"`skills[{i}]` is not an object",
                    "Skills must be JSON objects with `id` and `name`.",
                    "Replace this skill entry with a proper object.",
                ))
                continue
            sid = s.get("id")
            sname = s.get("name")
            if not isinstance(sid, str) or not sid.strip():
                out.append(_v(
                    "a2a_spec_violation", Severity.LOW,
                    f"`skills[{i}]` has no `id`",
                    "Every skill needs a stable string `id`.",
                    "Add a unique `id` for this skill.",
                ))
            elif sid in seen_ids:
                out.append(_v(
                    "a2a_spec_violation", Severity.MEDIUM,
                    f"Duplicate skill id `{sid}`",
                    "Skill ids must be unique across the agent card.",
                    "Rename one of the conflicting skills.",
                ))
            else:
                seen_ids.add(sid)
            if not isinstance(sname, str) or not sname.strip():
                out.append(_v(
                    "a2a_spec_violation", Severity.LOW,
                    f"`skills[{i}]` has no `name`",
                    "Every skill needs a human-readable `name`.",
                    "Add a `name`.",
                ))

    # defaultInputModes / defaultOutputModes: arrays of MIME-like strings
    for fld in ("defaultInputModes", "defaultOutputModes"):
        v = card.get(fld)
        if v is None:
            continue
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            out.append(_v(
                "a2a_spec_violation", Severity.LOW,
                f"`{fld}` is not an array of strings",
                f"Spec requires `{fld}` to be an array of strings like 'text' or 'application/json'.",
                f"Replace with an array of strings.",
            ))

    # provider should be an object if present
    prov = card.get("provider")
    if prov is not None and not isinstance(prov, dict):
        out.append(_v(
            "a2a_spec_violation", Severity.LOW,
            "`provider` is not an object",
            "Spec requires `provider` to be an object with at least `organization` and `url`.",
            "Replace with an object.",
        ))

    return out
