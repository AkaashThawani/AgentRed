"""AgentRed FastAPI app — see CONTRACT.md for the API contract."""
from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .events import create_bus, get_bus, get_report
from .models import ScanRequest, ScanResponse
from .orchestrator import run_scan

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
    asyncio.create_task(run_scan(bus, target_url=req.target_url))
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
