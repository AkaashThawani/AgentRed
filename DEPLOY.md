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

## Cloud — Render (current deployment)

Backend is a stock FastAPI service. No state on disk (everything is in-memory per scan
+ optional ClickHouse for persistence). Render runs it directly from this repo — no Dockerfile needed.

### Settings in the Render dashboard
| Field | Value |
|---|---|
| Repo | this monorepo |
| Branch | `main` |
| Root Directory | *(leave blank)* |
| Runtime | Python 3 |
| Build Command | `pip install -r backend/requirements.txt` |
| Start Command | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |
| Instance Type | **Starter ($7/mo)** — not Free (free tier sleeps and kills SSE streams) |
| Environment | `GEMINI_KEY=<your key>` (+ optional ClickHouse/Datadog vars) |

**Important:** leave Root Directory blank. The code uses package-relative imports
(`from .events import ...`) so it must run as the `backend` package, which means
starting from repo root with `backend.main:app`. If you set Root Directory =
`backend`, you have to prepend `cd .. &&` to the start command.

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
