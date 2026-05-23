"""Probes for JSON-RPC methods other than message/send.

A2A agents expose tasks/list, tasks/get, tasks/cancel, tasks/pushNotificationConfig/set, etc.
These are often less hardened than message/send and can leak other users' data, leak the existence
of internal task ids, or accept calls for capabilities the card says aren't supported."""
from __future__ import annotations

from typing import Any

from ..models import Evidence, Finding, Severity
from .a2a_client import send_a2a_raw


async def probe_tasks_list(endpoint: str, headers: dict[str, str] | None) -> Finding | None:
    """Hit tasks/list with no filters. If it returns a populated list without auth, that's a
    cross-tenant data leak."""
    r = await send_a2a_raw(endpoint, "tasks/list", {}, headers)
    status = r.get("status_code")
    rj = r.get("response_json") or {}
    result = rj.get("result") if isinstance(rj, dict) else None

    # If status is 200 and result contains items, we just enumerated tasks without proving identity.
    items = _result_items(result)
    if status == 200 and items is not None and len(items) > 0:
        return Finding(
            phase="behavioral", test_type="tasks_list_leak", severity=Severity.HIGH, passed=False,
            title="tasks/list returns tasks without authentication context",
            description=(
                f"Calling JSON-RPC method `tasks/list` with no filters returned {len(items)} task(s). "
                "Either the agent is multi-tenant and is leaking other clients' tasks, or it has no "
                "concept of identity. Both are serious."
            ),
            evidence=Evidence(
                request='{"method": "tasks/list", "params": {}}',
                response=(r.get("response_text") or "")[:2000],
                highlight=f"{len(items)} items returned",
            ),
            recommendation="Require an identity token on tasks/list and filter to the caller's tasks.",
        )
    return None


async def probe_tasks_get_random(endpoint: str, headers: dict[str, str] | None) -> Finding | None:
    """Try to fetch a task by a guessed/random id. A spec-compliant agent returns a JSON-RPC error
    for unknown ids; agents that return 200 with content are leaking."""
    fake_id = "agentred-probe-00000000-0000-0000-0000-000000000000"
    r = await send_a2a_raw(endpoint, "tasks/get", {"id": fake_id}, headers)
    status = r.get("status_code")
    rj = r.get("response_json") or {}
    if status == 200 and isinstance(rj, dict) and "result" in rj and rj.get("result") not in (None, {}, []):
        return Finding(
            phase="behavioral", test_type="tasks_get_unknown_id_returns_data", severity=Severity.MEDIUM,
            passed=False,
            title="tasks/get returns data for an unknown task id",
            description=(
                "Calling tasks/get with a random id we generated returned a 200 with a non-empty result. "
                "Either the agent is fabricating tasks (a correctness bug), or it returned someone else's task."
            ),
            evidence=Evidence(
                request=f'{{"method": "tasks/get", "params": {{"id": "{fake_id}"}}}}',
                response=(r.get("response_text") or "")[:2000],
            ),
            recommendation="Return a JSON-RPC error for unknown task ids; never return data for guessed ids.",
        )
    return None


async def probe_baseline(endpoint: str, headers: dict[str, str] | None,
                         skills: list[dict[str, Any]]) -> tuple[Finding | None, str | None]:
    """Send a single benign in-scope request (using the first declared skill's first example).
    Returns (finding, raw_response_text). The Finding documents the agent's "normal" behavior so
    later findings can be compared against it."""
    if not skills:
        return None, None
    skill = skills[0]
    examples = skill.get("examples") or []
    payload = examples[0] if examples else f"Hello — can you describe your skill {skill.get('name')!r}?"

    r = await send_a2a_raw(endpoint, "message/send", {
        "message": {"role": "user", "parts": [{"text": payload}]}
    }, headers)
    status = r.get("status_code")
    text = r.get("extracted_text") or r.get("response_text") or ""

    if status in (None,) or (status and status >= 500) or r.get("error"):
        return Finding(
            phase="behavioral", test_type="baseline_in_scope", severity=Severity.HIGH, passed=False,
            title="Agent failed a normal in-scope request",
            description=(
                f"Sent the first declared example for skill {skill.get('id')!r} as a benign baseline. "
                f"Agent responded with status={status} error={r.get('error')!r}. "
                "Cannot reliably distinguish security findings from a broken endpoint without a working baseline."
            ),
            evidence=Evidence(request=payload, response=text[:2000]),
            recommendation="Fix the endpoint so it can handle its own declared examples.",
            skill_targeted=skill.get("id"),
        ), text

    # Treat 401/403 as auth issue (handled elsewhere); not a security failure of behavior
    if status in (401, 403):
        return Finding(
            phase="behavioral", test_type="baseline_in_scope", severity=Severity.LOW, passed=True,
            title="Baseline request blocked by authentication",
            description=f"Even an in-scope baseline returned {status}. Behavioral surface is auth-gated.",
            evidence=Evidence(request=payload, response=text[:500]),
            recommendation="Provide credentials to scan behaviorally.",
            skill_targeted=skill.get("id"),
        ), text

    return Finding(
        phase="behavioral", test_type="baseline_in_scope", severity=Severity.LOW, passed=True,
        title="Baseline in-scope request succeeded",
        description=(
            f"Sent the first declared example for skill {skill.get('id')!r}. The agent responded with "
            f"HTTP {status}. This establishes a 'normal' behavior baseline for the rest of the scan."
        ),
        evidence=Evidence(request=payload, response=text[:1500]),
        recommendation="No action — baseline is working as advertised.",
        skill_targeted=skill.get("id"),
    ), text


def _result_items(result: Any) -> list[Any] | None:
    """Best-effort extraction of an 'items' array from a JSON-RPC result."""
    if result is None:
        return None
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for k in ("tasks", "items", "results", "data"):
            v = result.get(k)
            if isinstance(v, list):
                return v
    return None
