# AgentRed Backend

FastAPI service. See [../CONTRACT.md](../CONTRACT.md) for the API contract — that's the source of truth.

## Run

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Run from the **repo root** (so `backend` is importable as a package):
```powershell
uvicorn backend.main:app --reload --port 8000
```

## Endpoints
- `GET  /health`
- `POST /scan` — `{ target_url }` → `{ scan_id, stream_url }`
- `GET  /scan/mock` — start a canned mock scan (for UI dev)
- `GET  /stream/{scan_id}` — SSE event stream
- `GET  /report/{scan_id}` — final report JSON

## Try the mock end-to-end (PowerShell)

```powershell
# 1. start a mock scan
$res = curl http://localhost:8000/scan/mock | ConvertFrom-Json

# 2. follow the stream
curl http://localhost:8000$($res.stream_url)
```

Or from the browser open `http://localhost:8000/docs`.

## Layout
- `main.py` — FastAPI app + routes
- `models.py` — Pydantic types (mirrors CONTRACT.md)
- `events.py` — per-scan async event bus
- `mock_scan.py` — canned scan replay for UI dev
- `orchestrator.py` *(coming next)* — real Gemini-driven scan
- `tools/` *(coming next)* — fetch_card, static rules, generate_tests, send_a2a, analyze
- `storage.py` *(coming next)* — ClickHouse + Datadog writes
