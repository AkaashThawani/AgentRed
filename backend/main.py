"""AgentRed FastAPI app — see CONTRACT.md for the API contract."""
from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sse_starlette.sse import EventSourceResponse

from .badge import render_badge_svg
from .config import HTTP_TIMEOUT_S
from .events import create_bus, get_bus, get_report, list_reports
from .models import ScanRequest, ScanResponse
from .orchestrator import run_scan
from .storage import query_history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="AgentRed", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/scan", response_model=ScanResponse)
async def start_scan(req: ScanRequest) -> ScanResponse:
    scan_id = str(uuid4())
    bus = create_bus(scan_id)
    asyncio.create_task(run_scan(bus, target_url=req.target_url, auth_headers=req.auth_headers))
    return ScanResponse(scan_id=scan_id, stream_url=f"/stream/{scan_id}")


@app.get("/stream/{scan_id}")
async def stream(scan_id: str):
    bus = get_bus(scan_id)
    if bus is None:
        raise HTTPException(status_code=404, detail="scan_id not found")
    return EventSourceResponse(bus.stream())


@app.get("/report/{scan_id}")
async def report(scan_id: str) -> dict:
    rpt = get_report(scan_id)
    if rpt is None:
        raise HTTPException(status_code=404, detail="report not ready or scan_id not found")
    return rpt


@app.get("/badge/{scan_id}.svg")
async def badge(scan_id: str) -> Response:
    """Shields.io-style SVG trust badge for a completed scan."""
    rpt = get_report(scan_id)
    if rpt is None:
        raise HTTPException(status_code=404, detail="scan not complete yet")
    svg = render_badge_svg(grade=rpt.get("grade", "UNKNOWN"), score=int(rpt.get("trust_score", 0)))
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=60"},
    )


@app.get("/history")
async def history(
    target_url: str | None = Query(None, description="Filter by specific agent URL"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    """Historical trust scores from ClickHouse. Newest first. Persists across backend restarts
    (unlike /leaderboard which only sees the current process). Empty if ClickHouse not configured."""
    rows = query_history(target_url=target_url, limit=limit)
    return {
        "count": len(rows),
        "source": "clickhouse",
        "results": rows,
    }


@app.get("/leaderboard")
async def leaderboard(limit: int = Query(20, ge=1, le=100)) -> dict:
    """Returns the most recent completed scans sorted by trust_score desc."""
    rows = []
    for r in list_reports():
        rows.append({
            "scan_id": r.get("scan_id"),
            "target_url": r.get("target_url"),
            "agent_name": r.get("agent_name"),
            "trust_score": r.get("trust_score"),
            "grade": r.get("grade"),
            "duration_ms": r.get("duration_ms"),
            "ts": r.get("ts"),
            "badge_url": f"/badge/{r.get('scan_id')}.svg",
        })
    rows.sort(key=lambda r: (r.get("trust_score") or 0), reverse=True)
    return {"count": len(rows), "results": rows[:limit]}


@app.post("/scan/registry", response_model=dict)
async def scan_registry(limit: int = Query(5, ge=1, le=20)) -> dict:
    """Fetch agents from a2aregistry.org and kick off scans in parallel.
    Returns a list of {scan_id, target_url, name} so the UI can subscribe to each stream."""
    url = "https://a2aregistry.org/api/agents"
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S, follow_redirects=True) as client:
            resp = await client.get(url, params={"conformance": "standard"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch registry: {e}")

    agents = data.get("agents") if isinstance(data, dict) else data
    if not isinstance(agents, list):
        raise HTTPException(status_code=502, detail="Registry response shape unexpected")

    queued: list[dict] = []
    for a in agents[:limit]:
        if not isinstance(a, dict):
            continue
        target = a.get("wellKnownURI") or a.get("url") or a.get("homepage")
        if not target:
            continue
        scan_id = str(uuid4())
        bus = create_bus(scan_id)
        asyncio.create_task(run_scan(bus, target_url=target))
        queued.append({
            "scan_id": scan_id,
            "stream_url": f"/stream/{scan_id}",
            "target_url": target,
            "name": a.get("name") or target,
        })
    return {"queued": len(queued), "scans": queued}
