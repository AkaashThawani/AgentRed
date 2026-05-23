"""OWASP LLM Top 10 (2025) mapping.

Each AgentRed test_type maps to the most-relevant OWASP LLM Top 10 entry.
This adds standards-recognized context to every finding so security teams
can route them through their existing OWASP-based workflows.

Source: https://owasp.org/www-project-top-10-for-large-language-model-applications/"""
from __future__ import annotations

from .models import OwaspLlm

_BASE = "https://genai.owasp.org/llmrisk/"

_ENTRIES: dict[str, OwaspLlm] = {
    "LLM01": OwaspLlm(id="LLM01", name="Prompt Injection",                  url=_BASE + "llm01-prompt-injection/"),
    "LLM02": OwaspLlm(id="LLM02", name="Sensitive Information Disclosure",  url=_BASE + "llm02-sensitive-information-disclosure/"),
    "LLM03": OwaspLlm(id="LLM03", name="Supply Chain",                      url=_BASE + "llm03-supply-chain/"),
    "LLM04": OwaspLlm(id="LLM04", name="Data and Model Poisoning",          url=_BASE + "llm04-data-and-model-poisoning/"),
    "LLM05": OwaspLlm(id="LLM05", name="Improper Output Handling",          url=_BASE + "llm05-improper-output-handling/"),
    "LLM06": OwaspLlm(id="LLM06", name="Excessive Agency",                  url=_BASE + "llm06-excessive-agency/"),
    "LLM07": OwaspLlm(id="LLM07", name="System Prompt Leakage",             url=_BASE + "llm07-system-prompt-leakage/"),
    "LLM08": OwaspLlm(id="LLM08", name="Vector and Embedding Weaknesses",   url=_BASE + "llm08-vector-and-embedding-weaknesses/"),
    "LLM09": OwaspLlm(id="LLM09", name="Misinformation",                    url=_BASE + "llm09-misinformation/"),
    "LLM10": OwaspLlm(id="LLM10", name="Unbounded Consumption",             url=_BASE + "llm10-unbounded-consumption/"),
}

# Map AgentRed test_type → OWASP LLM ID
_MAPPING: dict[str, str] = {
    # Behavioral exploit categories
    "prompt_injection":     "LLM01",
    "scope_escape":         "LLM06",
    "canary_exfiltration":  "LLM02",
    "error_disclosure":     "LLM05",
    "role_confusion":       "LLM01",
    "pii_probe":            "LLM02",
    "capability_overstep":  "LLM06",
    # Behavioral meta
    "card_lies_about_behavior":      "LLM06",
    "scan_blocked_by_http_error":    "LLM10",
    "scan_blocked_by_auth":          "LLM10",
    "tasks_list_leak":               "LLM02",
    "tasks_get_unknown_id_returns_data": "LLM02",
    "baseline_in_scope":             "LLM10",
    "multi_turn_recall":             "LLM02",
    "multi_turn_persistence":        "LLM02",
    # Static
    "missing_auth":                  "LLM06",
    "insecure_transport":            "LLM02",
    "missing_endpoint":              "LLM05",
    "unsigned_card":                 "LLM03",
    "card_auth_mismatch":            "LLM05",
    "card_endpoint_unreachable":     "LLM05",
    "card_signature_invalid":        "LLM03",
    "auth_declared_no_scheme":       "LLM06",
    "provider_domain_mismatch":      "LLM03",
    "wellknown_uri_mismatch":        "LLM03",
    "over_scoped_skills":            "LLM06",
    "vague_skill_description":       "LLM06",
    "skill_missing_description":     "LLM05",
    "non_semver_version":            "LLM05",
    "missing_version":               "LLM05",
    "no_skills_declared":            "LLM05",
    # Conformance
    "a2a_spec_violation":            "LLM05",
}


def owasp_for(test_type: str) -> OwaspLlm | None:
    """Look up the OWASP LLM Top 10 entry for a given AgentRed test_type."""
    llm_id = _MAPPING.get(test_type)
    if llm_id is None:
        return None
    return _ENTRIES.get(llm_id)
