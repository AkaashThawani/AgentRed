"""Enrich Finding objects with OWASP mapping + reproducer commands.

Called by the orchestrator just before each finding is emitted. Keeps the orchestrator
itself clean — every emit point goes through enrich_finding()."""
from __future__ import annotations

import json
import shlex
from typing import Any

from .models import Evidence, Finding
from .owasp import owasp_for


def enrich_finding(f: Finding, *, endpoint: str | None, auth_headers: dict[str, str] | None) -> Finding:
    """Annotate a Finding with OWASP + reproducer. Mutates and returns."""
    if f.owasp_llm is None:
        f.owasp_llm = owasp_for(f.test_type)

    if f.reproducer is None:
        f.reproducer = _build_reproducer(f, endpoint=endpoint, auth_headers=auth_headers)

    return f


def _build_reproducer(f: Finding, *, endpoint: str | None, auth_headers: dict[str, str] | None) -> str | None:
    """Best-effort reproducer string. Returns None if we can't make a useful one."""
    # Static / conformance findings: not network-reproducible, but we can point at the card
    if f.phase == "static" or f.phase == "conformance":
        origin_url = endpoint  # the orchestrator passes the agent endpoint; we use its origin
        if not origin_url:
            return None
        # Construct curl for the agent card itself
        return f"curl -s {shlex.quote(_origin(origin_url) + '/.well-known/agent-card.json')} | jq ."

    # Behavioral findings: rebuild the JSON-RPC call. test_type 'baseline_in_scope' and the
    # message-based tests all used method=message/send. RPC probes used tasks/list or tasks/get.
    if not endpoint:
        return None
    method, params = _infer_call(f)
    if method is None:
        return None

    headers_block = ""
    if auth_headers:
        for k, v in auth_headers.items():
            headers_block += f" -H {shlex.quote(f'{k}: {v}')}"

    body = {
        "jsonrpc": "2.0",
        "id": "reproducer-001",
        "method": method,
        "params": params,
    }
    body_json = json.dumps(body, ensure_ascii=False)
    return (
        f"curl -X POST {shlex.quote(endpoint)}"
        f" -H 'Content-Type: application/json'"
        f"{headers_block}"
        f" -d {shlex.quote(body_json)}"
    )


def _infer_call(f: Finding) -> tuple[str | None, dict[str, Any]]:
    """Reconstruct the method+params from finding evidence."""
    if f.test_type == "tasks_list_leak":
        return "tasks/list", {}
    if f.test_type == "tasks_get_unknown_id_returns_data":
        return "tasks/get", {"id": "agentred-probe-00000000-0000-0000-0000-000000000000"}
    payload = (f.evidence.request or "").strip() if f.evidence else ""
    if not payload:
        return None, {}
    # All other behavioral tests are message/send with the payload as user text
    return "message/send", {"message": {"role": "user", "parts": [{"text": payload}]}}


def _origin(url: str) -> str:
    """Best-effort origin extraction."""
    from urllib.parse import urlparse
    p = urlparse(url)
    if p.scheme and p.netloc:
        return f"{p.scheme}://{p.netloc}"
    return url
