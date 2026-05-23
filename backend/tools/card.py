"""Fetch and lightly validate an A2A agent card."""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from ..config import HTTP_TIMEOUT_S

WELL_KNOWN_PATH = "/.well-known/agent-card.json"


def _normalize_base(url: str) -> str:
    """Accept either the agent's base origin or its full A2A endpoint URL,
    and return the origin we should append `/.well-known/agent-card.json` to."""
    p = urlparse(url)
    if not p.scheme:
        url = "https://" + url
        p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


async def fetch_agent_card(url: str) -> dict[str, Any]:
    """GET <origin>/.well-known/agent-card.json. Raises on non-2xx or invalid JSON."""
    origin = _normalize_base(url)
    card_url = urljoin(origin + "/", WELL_KNOWN_PATH.lstrip("/"))
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S, follow_redirects=True) as client:
        resp = await client.get(card_url, headers={"Accept": "application/json"})
        resp.raise_for_status()
        card = resp.json()
    if not isinstance(card, dict):
        raise ValueError(f"Agent card at {card_url} is not a JSON object")
    card["_meta"] = {"fetched_from": card_url, "origin": origin}
    return card
