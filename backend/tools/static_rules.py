"""Deterministic static analysis over an A2A agent card.
Pure functions, no LLM, no network — fast and reproducible."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from ..models import Evidence, Finding, Severity

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+([-+].+)?$")
_VAGUE_TERMS = ("anything", "any task", "general purpose", "general-purpose", "all kinds", "everything")


def _finding(test_type: str, severity: Severity, title: str, description: str,
             recommendation: str, evidence: Evidence | None = None,
             skill_targeted: str | None = None) -> Finding:
    return Finding(
        phase="static",
        test_type=test_type,
        severity=severity,
        passed=False,
        title=title,
        description=description,
        evidence=evidence or Evidence(),
        recommendation=recommendation,
        skill_targeted=skill_targeted,
    )


def run_static_checks(card: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []

    # version
    version = card.get("version")
    if not version:
        findings.append(_finding(
            "missing_version", Severity.LOW,
            "Agent card has no version",
            "The `version` field is missing — clients cannot pin a known-good version.",
            "Add a SemVer `version` field to the agent card.",
        ))
    elif not _SEMVER_RE.match(str(version)):
        findings.append(_finding(
            "non_semver_version", Severity.LOW,
            "Version is not SemVer",
            f"`version` is `{version}` which is not SemVer-compliant.",
            "Use SemVer (MAJOR.MINOR.PATCH).",
            Evidence(highlight=f'"version": "{version}"'),
        ))

    # transport: HTTPS
    endpoint = card.get("url") or ""
    if endpoint:
        parsed = urlparse(endpoint)
        if parsed.scheme == "http":
            findings.append(_finding(
                "insecure_transport", Severity.HIGH,
                "Agent endpoint uses HTTP, not HTTPS",
                f"Endpoint `{endpoint}` is plaintext — credentials and content can be intercepted.",
                "Serve the A2A endpoint over HTTPS with a valid certificate.",
                Evidence(highlight=endpoint),
            ))
    else:
        findings.append(_finding(
            "missing_endpoint", Severity.HIGH,
            "Agent card declares no endpoint URL",
            "The `url` field is missing — the agent cannot be invoked.",
            "Add the `url` field pointing at the JSON-RPC endpoint.",
        ))

    # authentication
    auth = card.get("authentication") or {}
    schemes = auth.get("schemes") or []
    if not schemes:
        findings.append(_finding(
            "missing_auth", Severity.HIGH,
            "Agent declares no authentication",
            "`authentication.schemes` is empty — the agent is a fully public attack surface.",
            "Require Bearer auth, OAuth, or mTLS before deployment.",
            Evidence(highlight='"authentication": {"schemes": []}'),
        ))

    # securitySchemes
    sec_schemes = card.get("securitySchemes")
    if schemes and not sec_schemes:
        findings.append(_finding(
            "auth_declared_no_scheme", Severity.MEDIUM,
            "Auth declared but no securitySchemes",
            "`authentication.schemes` is set but `securitySchemes` is missing — clients cannot resolve credentials.",
            "Add a matching `securitySchemes` entry per the A2A spec.",
        ))

    # signature
    if not card.get("agentCardSignature"):
        findings.append(_finding(
            "unsigned_card", Severity.MEDIUM,
            "Agent card is unsigned",
            "`agentCardSignature` is missing — clients cannot verify the card's authenticity.",
            "Sign the agent card with Ed25519 per A2A spec.",
        ))

    # provider URL / domain mismatch
    provider = card.get("provider") or {}
    provider_url = provider.get("url")
    if provider_url:
        try:
            p_dom = urlparse(provider_url).netloc.lower()
            ep_dom = urlparse(endpoint).netloc.lower() if endpoint else ""
            if p_dom and ep_dom and not (p_dom == ep_dom or ep_dom.endswith("." + p_dom) or p_dom.endswith("." + ep_dom)):
                findings.append(_finding(
                    "provider_domain_mismatch", Severity.MEDIUM,
                    "Provider domain does not match endpoint domain",
                    f"Provider is `{p_dom}` but the agent endpoint runs on `{ep_dom}`.",
                    "Confirm the provider owns the endpoint domain.",
                    Evidence(highlight=f"{p_dom} vs {ep_dom}"),
                ))
        except Exception:
            pass

    # wellKnownURI: card declares a canonical location that may differ from where we fetched it
    well_known = card.get("wellKnownURI")
    fetched_from = (card.get("_meta") or {}).get("fetched_from")
    if isinstance(well_known, str) and fetched_from and well_known.strip().rstrip("/") != fetched_from.strip().rstrip("/"):
        findings.append(_finding(
            "wellknown_uri_mismatch", Severity.MEDIUM,
            "Card's declared canonical wellKnownURI differs from where we fetched it",
            f"The card was fetched from `{fetched_from}` but declares its canonical location as `{well_known}`. "
            "This could be a mirror, a stale copy, or an impersonation. Clients should treat them as separate identities.",
            "Confirm the canonical card matches what is served at the declared wellKnownURI.",
            Evidence(highlight=f"{fetched_from} vs {well_known}"),
        ))

    # skills
    skills = card.get("skills") or []
    if not skills:
        findings.append(_finding(
            "no_skills_declared", Severity.MEDIUM,
            "Agent declares no skills",
            "The `skills` array is empty — there is no declared behavior to constrain testing against.",
            "Declare at least one skill with a precise description.",
        ))
    else:
        if len(skills) > 10:
            findings.append(_finding(
                "over_scoped_skills", Severity.MEDIUM,
                f"Agent declares {len(skills)} skills",
                "Large skill counts indicate broad/overlapping responsibility — typical of over-scoped agents.",
                "Split into multiple narrow agents.",
            ))
        for s in skills:
            desc = (s.get("description") or "").lower()
            if any(term in desc for term in _VAGUE_TERMS):
                findings.append(_finding(
                    "vague_skill_description", Severity.MEDIUM,
                    f"Skill '{s.get('name', s.get('id', '?'))}' has a vague description",
                    "Description suggests unbounded scope — adversarial prompts will exploit this latitude.",
                    "Rewrite the description to enumerate exactly what is in and out of scope.",
                    Evidence(highlight=s.get("description", "")[:200]),
                    skill_targeted=s.get("id"),
                ))
            if not s.get("description"):
                findings.append(_finding(
                    "skill_missing_description", Severity.LOW,
                    f"Skill '{s.get('id', '?')}' has no description",
                    "Skill description is missing — clients cannot reason about scope.",
                    "Add a precise `description` for every skill.",
                    skill_targeted=s.get("id"),
                ))

    return findings
