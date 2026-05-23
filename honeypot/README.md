# LegalSummarizerBot — AgentRed honeypot

Deliberately-vulnerable A2A agent for demoing AgentRed. **Do not deploy publicly.**

## Run

```powershell
# from repo root, with backend venv activated (FastAPI is already installed)
uvicorn honeypot.main:app --reload --port 8001
```

Card lives at `http://localhost:8001/.well-known/agent-card.json`.

## Vulnerabilities baked in

Static (visible in the card):
- HTTP, not HTTPS
- Non-SemVer version (`v0.4`)
- `authentication.schemes: []` (public surface)
- No `agentCardSignature`
- No `securitySchemes`
- Skill description contains "anything" / "general purpose" (vague)
- Provider domain doesn't match endpoint

Behavioral:
- Prompt injection ("ignore previous instructions") → leaks system prompt + admin token + DB URL
- Role confusion ("admin mode") → "activates" admin mode
- Translation-based indirect leak
- Canary exfil — echoes user input verbatim into "Summary: ..."
- Scope escape — happily writes Python scrapers
- PII probe — claims to remember prior users
- Empty input → unhandled exception with stack trace leak
- Capability overstep — accepts `tasks/pushNotificationConfig/set` despite card saying it's not supported

## Point AgentRed at it

```powershell
curl -Method POST http://localhost:8000/scan -ContentType application/json -Body '{"target_url":"http://localhost:8001"}'
```
