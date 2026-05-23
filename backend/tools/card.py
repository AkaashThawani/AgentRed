"""Fetch and lightly validate an A2A agent card."""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from ..config import HTTP_TIMEOUT_S

# A2A spec evolved: newer agents use /.well-known/agent-card.json, older ones /.well-known/agent.json.
# Try both, plus honor any explicit path the user pastes.
WELL_KNOWN_PATHS = (
    "/.well-known/agent-card.json",
    "/.well-known/agent.json",
)


def _normalize_base(url: str) -> str:
    """Return origin (scheme://host[:port]) from any input URL."""
    p = urlparse(url)
    if not p.scheme:
        url = "https://" + url
        p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


async def fetch_agent_card(url: str) -> dict[str, Any]:
    """Fetch the agent card. Tries the URL as-given (if user pasted a card URL directly),
    then both well-known paths under the origin. Raises if none return valid JSON."""
    origin = _normalize_base(url)
    parsed = urlparse(url if "://" in url else "https://" + url)

    candidates: list[str] = []
    # 1. If the user pasted a path that *looks* like a card path, honor it first.
    if parsed.path and parsed.path not in ("", "/"):
        candidates.append(f"{origin}{parsed.path}")
    # 2. Standard well-known paths.
    for p in WELL_KNOWN_PATHS:
        candidates.append(urljoin(origin + "/", p.lstrip("/")))
    # Dedupe preserving order
    seen: set[str] = set()
    candidates = [c for c in candidates if not (c in seen or seen.add(c))]

    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S, follow_redirects=True) as client:
        for card_url in candidates:
            try:
                resp = await client.get(card_url, headers={"Accept": "application/json"})
                if resp.status_code == 404:
                    last_err = httpx.HTTPStatusError(
                        f"404 Not Found for {card_url}", request=resp.request, response=resp,
                    )
                    continue
                resp.raise_for_status()
                card = resp.json()
                if not isinstance(card, dict):
                    last_err = ValueError(f"Agent card at {card_url} is not a JSON object")
                    continue
                card["_meta"] = {"fetched_from": card_url, "origin": origin}
                return card
            except (httpx.HTTPError, ValueError) as e:
                last_err = e
                continue

    raise (last_err or RuntimeError(f"No agent card found under {origin}"))
