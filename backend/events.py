"""Per-scan event bus. Each scan owns an asyncio.Queue; producers push events,
the SSE endpoint drains it. A terminal `report` or `error` event closes the stream."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from collections import OrderedDict

# Bounded LRU caches — prevents unbounded growth across many scans (e.g. registry bulk scans).
# Insertion-order kept; oldest evicted when capacity exceeded.
_MAX_BUSES = 200
_MAX_REPORTS = 200
_buses: "OrderedDict[str, EventBus]" = OrderedDict()
_reports: "OrderedDict[str, dict[str, Any]]" = OrderedDict()


def _evict_if_over(cache: OrderedDict, cap: int) -> None:
    while len(cache) > cap:
        cache.popitem(last=False)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventBus:
    def __init__(self, scan_id: str) -> None:
        self.scan_id = scan_id
        self.queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self.closed = False

    async def emit(self, event_type: str, **fields: Any) -> None:
        if self.closed:
            return
        payload = {"type": event_type, "ts": _now(), **fields}
        await self.queue.put(payload)
        if event_type in ("report", "error"):
            self.closed = True
            await self.queue.put(None)  # sentinel to close the stream

    async def stream(self) -> AsyncIterator[dict[str, str]]:
        """Yield sse-starlette compatible event dicts."""
        while True:
            item = await self.queue.get()
            if item is None:
                return
            yield {
                "event": item["type"],
                "data": json.dumps(item, default=str),
            }


def create_bus(scan_id: str) -> EventBus:
    bus = EventBus(scan_id)
    _buses[scan_id] = bus
    _evict_if_over(_buses, _MAX_BUSES)
    return bus


def get_bus(scan_id: str) -> EventBus | None:
    return _buses.get(scan_id)


def save_report(scan_id: str, report: dict[str, Any]) -> None:
    _reports[scan_id] = report
    _evict_if_over(_reports, _MAX_REPORTS)


def get_report(scan_id: str) -> dict[str, Any] | None:
    return _reports.get(scan_id)


def list_reports() -> list[dict[str, Any]]:
    """All cached final reports (process lifetime). Order: insertion-order from dict."""
    return list(_reports.values())
