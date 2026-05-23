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
- `orchestrator.py` — agentic scan loop with adaptive follow-ups
- `scoring.py` — trust score + grade formula
- `storage.py` — ClickHouse + Datadog writes (best-effort)
- `config.py` — env-var-driven configuration
- `tools/`
  - `card.py` — `/.well-known/agent-card.json` fetch
  - `static_rules.py` — deterministic static analyzer
  - `a2a_client.py` — JSON-RPC `message/send` over httpx
  - `gemini.py` — shared async Gemini client
  - `test_gen.py` — Gemini-generated typed `TestCase` objects + adaptive follow-ups
  - `response_analyzer.py` — hybrid deterministic + LLM judgment

## Demo against the local honeypot

In one terminal:
```powershell
uvicorn honeypot.main:app --reload --port 8001
```
In another:
```powershell
uvicorn backend.main:app --reload --port 8000
```
Then:
```powershell
curl -Method POST http://localhost:8000/scan -ContentType application/json -Body '{"target_url":"http://localhost:8001"}'
```
Use the returned `stream_url` to consume SSE events.
