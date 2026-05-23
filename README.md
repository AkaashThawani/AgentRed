# AgentRed

Automated security scanner for A2A (Agent-to-Agent) protocol agents.

Point it at any A2A-compliant agent URL → it fetches the agent card, runs static analysis, generates adversarial test cases from the card's declared skills, fires them at the live endpoint, and returns a trust score with evidence.

## Repo layout
- `backend/` — FastAPI + Gemini orchestrator + A2A transport
- `frontend/` — UI (live SSE stream of scan results)
- `honeypot/` — deliberately-vulnerable A2A agent for the demo
- `CONTRACT.md` — backend ↔ frontend API + event schema (**source of truth**)
- `DEPLOY.md` — local + cloud deployment notes

## Status
Hackathon MVP in progress. See `CONTRACT.md` for the locked v1 API.
