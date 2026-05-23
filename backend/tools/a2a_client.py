"""Minimal A2A JSON-RPC 2.0 client. Sends `message/send` and returns the raw response."""
from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import httpx

from ..config import HTTP_TIMEOUT_S


async def send_a2a_message(endpoint_url: str, payload_text: str,
                           extra_headers: dict[str, str] | None = None) -> dict[str, Any]:
    """POST a JSON-RPC `message/send` to the agent endpoint.

    Returns a dict with:
      - status_code: HTTP status
      - response_json: parsed JSON-RPC response (or None)
      - response_text: raw text (always)
      - extracted_text: best-effort string of the agent's reply for analysis
      - error: optional error string (transport-level failures)
    """
    req_body = {
        "jsonrpc": "2.0",
        "id": str(uuid4()),
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"text": payload_text}],
            }
        },
    }
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S, follow_redirects=True) as client:
            resp = await client.post(endpoint_url, json=req_body, headers=headers)
        text = resp.text
        parsed: Any = None
        try:
            parsed = resp.json()
        except json.JSONDecodeError:
            parsed = None
        return {
            "status_code": resp.status_code,
            "response_json": parsed,
            "response_text": text,
            "extracted_text": _extract_text(parsed) or text,
            "error": None,
            "request_body": req_body,
        }
    except httpx.HTTPError as e:
        return {
            "status_code": None,
            "response_json": None,
            "response_text": "",
            "extracted_text": "",
            "error": f"{type(e).__name__}: {e}",
            "request_body": req_body,
        }


def _extract_text(parsed: Any) -> str:
    """Best-effort: dig through JSON-RPC + A2A message structure for textual content."""
    if not isinstance(parsed, dict):
        return ""
    result = parsed.get("result")
    if result is None:
        err = parsed.get("error")
        if isinstance(err, dict):
            return json.dumps(err)
        return ""

    # Common A2A shapes:
    # result.message.parts[].text  OR  result.parts[].text  OR  result.artifacts[].parts[].text
    candidates = []
    if isinstance(result, dict):
        if isinstance(result.get("message"), dict):
            candidates.append(result["message"].get("parts"))
        candidates.append(result.get("parts"))
        for art in (result.get("artifacts") or []) if isinstance(result.get("artifacts"), list) else []:
            if isinstance(art, dict):
                candidates.append(art.get("parts"))
        # Some agents return a flat `text` field
        if isinstance(result.get("text"), str):
            return result["text"]
        if isinstance(result.get("output"), str):
            return result["output"]

    out: list[str] = []
    for parts in candidates:
        if isinstance(parts, list):
            for p in parts:
                if isinstance(p, dict) and isinstance(p.get("text"), str):
                    out.append(p["text"])
    if out:
        return "\n".join(out)
    # Fallback: dump the whole result
    try:
        return json.dumps(result)[:5000]
    except Exception:
        return ""
