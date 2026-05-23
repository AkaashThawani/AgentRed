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
                    last_err = ValueError(f"404 Not Found at {card_url}")
                    continue
                resp.raise_for_status()
                try:
                    card = resp.json()
                except ValueError:
                    last_err = ValueError(
                        f"{card_url} returned non-JSON content "
                        f"(content-type={resp.headers.get('content-type')!r}). "
                        "This URL does not appear to host an A2A agent card."
                    )
                    continue
                if not _looks_like_agent_card(card):
                    last_err = ValueError(
                        f"{card_url} returned JSON, but it does not look like an A2A agent card "
                        "(missing required fields such as `name` and `url`/`skills`)."
                    )
                    continue
                card["_meta"] = {"fetched_from": card_url, "origin": origin}
                return card
            except httpx.ConnectError as e:
                raise ValueError(
                    f"Could not connect to {origin}. Check the URL is correct and the host is reachable. "
                    f"({type(e).__name__}: {e})"
                ) from e
            except httpx.TimeoutException as e:
                raise ValueError(f"Timed out connecting to {origin} ({HTTP_TIMEOUT_S}s).") from e
            except httpx.HTTPError as e:
                last_err = e
                continue

    raise ValueError(
        f"No A2A agent card found at {origin}. Tried: "
        + ", ".join(candidates)
        + f". Last error: {last_err}"
    )


def _looks_like_agent_card(card: object) -> bool:
    """An A2A card must at minimum be a JSON object with a `name` and either a `url`
    (JSON-RPC endpoint) or a non-empty `skills` array. This rejects random JSON pages
    that happen to live at /.well-known paths."""
    if not isinstance(card, dict):
        return False
    if not isinstance(card.get("name"), str) or not card["name"].strip():
        return False
    has_url = isinstance(card.get("url"), str) and card["url"].strip()
    has_skills = isinstance(card.get("skills"), list) and len(card["skills"]) > 0
    has_interfaces = isinstance(card.get("interfaces"), list) and len(card["interfaces"]) > 0
    return bool(has_url or has_skills or has_interfaces)
