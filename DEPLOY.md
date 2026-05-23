# Deploying AgentRed

Two parts: the **backend** (FastAPI + Gemini) and (optionally) the **honeypot**
(deliberately vulnerable A2A agent — only for demos, never on the public internet).

---

## Local — quick start (recommended for hackathon)

```powershell
# from repo root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# backend/.env must contain:
#   GEMINI_KEY=...
# Optional:
#   CLICKHOUSE_URL=..., CLICKHOUSE_USER=..., CLICKHOUSE_PASSWORD=...
#   DATADOG_API_KEY=...

# terminal A — honeypot (demo target)
uvicorn honeypot.main:app --port 8001

# terminal B — AgentRed backend
uvicorn backend.main:app --port 8000

# terminal C — verify
curl http://localhost:8000/health
```

Frontend points at `http://localhost:8000`. That's it for demoing.

---

## Cloud — single-host (Fly.io / Render / Railway / EC2)

Backend is a stock FastAPI service. No state on disk (everything is in-memory per scan
+ optional ClickHouse for persistence). Easy to deploy anywhere that runs Python.

### Dockerfile (drop in at repo root)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend /app/backend
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Fly.io (monorepo — Dockerfile at root, fly.toml in backend/)

The Dockerfile lives at the repo root so the `backend` Python package imports
resolve cleanly. The fly.toml lives at `backend/fly.toml`. **Deploy from the
repo root.**

```powershell
# from repo root
fly auth whoami
fly apps create agentred-backend         # one-time. pick your own name.
# edit backend/fly.toml: set `app = "agentred-backend"` to match the name you just created
fly secrets set GEMINI_KEY=<your_key> --app agentred-backend
fly deploy --config backend/fly.toml --app agentred-backend
```

Common gotchas:
- **"app not found"** → you skipped `fly apps create` or `app =` in fly.toml doesn't match.
  Run `fly apps list` to see what's actually registered.
- **Machine sleeps mid-scan** → fly.toml sets `auto_stop_machines = "off"`. Don't change it; SSE streams need the VM awake.
- **Path errors during build** → make sure you're deploying from the **repo root**, not from `backend/`.
  The Dockerfile does `COPY backend/...` which only resolves from the root.

### Render
1. New → Web Service → connect this repo
2. Build command: `pip install -r backend/requirements.txt`
3. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Environment → add `GEMINI_KEY` (and optional infra)

### Railway
Same as Render — set the start command + env vars in the dashboard.

---

## SSE through a proxy (important)

AgentRed streams via Server-Sent Events. Anything that buffers responses will
make the UI feel broken. If you put a proxy / CDN in front:

- **nginx**: add `proxy_buffering off;` and `proxy_read_timeout 600s;`
- **Cloudflare**: SSE works, but **disable "Auto Minify"** and the response is held until first byte unless you stream. Free plan times out at 100s — paid plans / Workers are safer.
- **AWS ALB**: set idle timeout ≥ 120s.
- **Vercel/Netlify functions**: don't — their 10-60s function timeout will cut scans short. Use a real server.

CORS is wide-open (`allow_origins=["*"]`) in `backend/main.py` — fine for the hackathon, lock it down for production.

---

## Honeypot deployment

**Do not deploy the honeypot to a public URL.** It deliberately leaks fake admin
tokens and complies with prompt injection — its only purpose is to be a target
in a controlled demo.

If you must demo it remotely (e.g. judges on a different network), run it on a
VPS with the port firewalled to your machines only, or expose it through ngrok
for the duration of the demo and tear it down immediately after:

```powershell
ngrok http 8001
# point AgentRed at the ngrok URL
```

---

## Verifying a deploy

```powershell
# health
curl https://your-host/health
# → {"ok":true}

# end-to-end against the honeypot (or any A2A agent)
curl -Method POST https://your-host/scan -ContentType application/json `
  -Body '{"target_url":"http://localhost:8001"}'
```

Expect:
- `scan_id` returned in <100ms
- SSE stream begins immediately with `scan_started`
- `card_fetched` within ~1s
- Static `finding` events within 1-2s
- First `test_generated` within 3-6s (Gemini latency)
- First `test_running` / `finding` (behavioral) shortly after
- Possibly one or more `adaptive_followup` events
- Final `report` event closes the stream
- `GET /report/{scan_id}` returns the cached final report

Typical full scan against the honeypot: **30-60s**.

---

## How the report is generated

You don't have to do anything — it's emitted automatically as the last SSE event
and cached for retrieval. Lifecycle:

1. Orchestrator finishes the last (possibly follow-up) test.
2. `compute_score(findings)` runs — pure function in `backend/scoring.py`.
   Deductions per test_type, capped, plus static bonuses → 0-100 + grade.
3. `compute_stats(findings)` tallies counts by severity.
4. Findings are sorted by severity desc, static-first, then ts asc.
5. Report assembled (`Report` Pydantic model in `backend/models.py`).
6. Saved in-memory keyed by `scan_id` (`backend/events.save_report`).
7. Pushed as final SSE event (`event: report`).
8. Available at `GET /report/{scan_id}` for the lifetime of the process.

The exact schema is locked in [CONTRACT.md](CONTRACT.md) under "Core Types → Report".
