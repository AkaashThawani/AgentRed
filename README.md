# AgentRed

AgentRed is a small agent-scanning demo: a FastAPI backend that runs agent scans and streams events, and a Next.js frontend for running and visualizing scans.

This README documents requirements, how the project is structured, how to run it locally, the API surface, and development tips.

---

## Overview

- Backend: Python + FastAPI. Exposes endpoints to start scans, stream events (SSE), and fetch final reports.
- Frontend: Next.js (React) app that starts scans and consumes the SSE stream to show progress and results.
- Purpose: demonstrate an automated agent scanner with event streaming and an interactive UI.

## Architecture

- `backend/` — FastAPI app. Key modules:
  - `main.py` — FastAPI app and routes
  - `events.py` — per-scan async event bus
  - `orchestrator.py` — scan orchestration and adaptive follow-ups
  - `scoring.py` — trust score calculation and grade
  - `tools/` — helpers (card fetcher, static rules, a2a client, etc.)
- `frontend/` — Next.js app (app router). UI components in `components/`, API helpers in `lib/`.

## Requirements

- Python 3.11+
- Node.js 18+ (or the version supported by your package lock)
- `pip` and a virtual environment tool
- `npm` or `pnpm` for the frontend

Optional:
- `gh` (GitHub CLI) if you want to create fork/PR from the command line

## Quick start (local development)

Recommended: run from the repository root so `backend` is importable as a package.

1. Clone the repo

```bash
git clone https://github.com/<OWNER>/AgentRed.git
cd AgentRed
```

2. Backend setup (Windows / PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# From the repo root (important):
uvicorn backend.main:app --reload --port 8000
```

3. Frontend setup

```powershell
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

Notes:
- The backend run command must be executed from the repo root (so `backend` is importable). If you run from inside `backend/`, use `uvicorn main:app` instead.

## Environment variables

- Backend (`backend/config.py` reads these):
  - `DATABASE_URL` — optional DB connection (if using storage features)
  - `CLICKHOUSE_URL`, `DATADOG_API_KEY` — optional integrations
  - `AGENT_CARD_PATH` — override card fetch path
- Frontend:
  - `NEXT_PUBLIC_API_BASE_URL` — base URL of the backend (default `http://localhost:8000`)

Create a `.env` or set these in your environment for non-default behavior.

## API Endpoints

- `GET /health` — health check. Returns `{ ok: true }` when healthy.
- `POST /scan` — start a scan. Body: `{ "target_url": "https://example.com" }`. Returns `{ scan_id, stream_url }`.
- `GET /scan/mock` — start a canned mock scan for UI development. Returns same shape as `POST /scan`.
- `GET /stream/{scan_id}` — Server-Sent Events stream for scan progress (SSE). Events include `scan_started`, `phase`, `finding`, `test_generated`, `test_running`, `adaptive_followup`, `report`, and `error`.
- `GET /report/{scan_id}` — final JSON report for a finished scan.

Example: start a mock scan and follow the stream (PowerShell)

```powershell
$res = curl http://localhost:8000/scan/mock | ConvertFrom-Json
curl http://localhost:8000$($res.stream_url)
```

Example: start a real scan (POST)

```bash
curl -X POST http://localhost:8000/scan -H 'Content-Type: application/json' -d '{"target_url":"http://example.com"}'
```

## Trust Score (how scoring works)

The `scoring.py` module computes a trust score and a grade. A simple representation of a typical test-based score is:

Inline formula (example): $\text{Trust Score} = 100 \cdot \frac{\text{passed tests}}{\text{total tests}}$

Grades are derived from ranges of the trust score (A/B/C etc.). See `backend/scoring.py` for the exact production formula.

## Running the honeypot demo

To run the demo honeypot and scan it locally (two terminals):

```powershell
# terminal 1
uvicorn honeypot.main:app --reload --port 8001

# terminal 2 (from repo root)
uvicorn backend.main:app --reload --port 8000

# then POST a scan to the backend pointing at the honeypot
curl -Method POST http://localhost:8000/scan -ContentType application/json -Body '{"target_url":"http://localhost:8001"}'
```

## Development notes

- UI: the frontend expects the backend at `NEXT_PUBLIC_API_BASE_URL` — set it in `.env.local` to test remote backends.
- When encountering import errors with Uvicorn, ensure you run it from the repo root as shown above so `backend` is on `PYTHONPATH`.
- The frontend uses SSE (`EventSource`) and expects the `stream_url` returned by `/scan` to be an absolute or leading-slash path.

## Tests

- No formal test harness is included in this repo snapshot. For quick manual checks:
  - Start backend, run `/scan/mock`, confirm SSE events appear.
  - Start frontend dev server (`npm run dev`) and exercise the UI.

## Contributing

- Fork the repo, work on a branch named like `fix/description` or `feat/description`, push and open a PR against `main`.
- Follow the existing code style. For frontend changes, run the dev server and verify UI behavior.

## License & Contact

This repository is provided for demonstration purposes. Contact the repository owner for licensing and contribution guidance.
