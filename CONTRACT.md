# AgentRed — Backend ↔ Frontend Contract

Status: **v1 — locked for hackathon MVP**. Ping backend if you need a field added.

Base URL (local dev): `http://localhost:8000`

---

## Endpoints

### `POST /scan`
Start a new scan.

**Request**
```json
{ "target_url": "https://some-agent.example.com" }
```

**Response**
```json
{ "scan_id": "uuid-string", "stream_url": "/stream/<scan_id>" }
```

### `GET /stream/{scan_id}`
Server-Sent Events stream. Each event is:
```
event: <type>
data: <json>

```
See **Event Types** below. Stream closes after the `report` event.

### `GET /report/{scan_id}`
Final report JSON (also pushed as last SSE event). Use this if user reloads.

### `GET /health`
`{ "ok": true }`

---

## Event Types

Every `data` payload includes `type` and `ts` (ISO-8601 string). Only the extra fields are shown below.

### `scan_started`
```json
{ "type": "scan_started", "scan_id": "...", "target_url": "...", "ts": "..." }
```

### `card_fetched`
```json
{ "type": "card_fetched", "card": { /* AgentCard, see below */ }, "ts": "..." }
```

### `phase`
Phase transition signal. Use to update the UI section header.
```json
{ "type": "phase", "phase": "static" | "behavioral" | "report", "message": "Generating test cases...", "ts": "..." }
```

### `finding`
Streamed one-by-one as findings land (both static and behavioral).
```json
{ "type": "finding", "finding": { /* Finding */ }, "ts": "..." }
```

### `test_generated`
A test case the agent has decided to run.
```json
{ "type": "test_generated", "test": { /* TestCase */ }, "ts": "..." }
```

### `test_running`
Test fired at target, awaiting response.
```json
{ "type": "test_running", "test_id": "...", "test_type": "prompt_injection", "ts": "..." }
```

### `adaptive_followup`  *(the demo wow-moment)*
Emitted when AgentRed decides to dig deeper on a HIGH/CRITICAL finding.
```json
{
  "type": "adaptive_followup",
  "parent_finding_id": "...",
  "reason": "Detected partial system-prompt leak — generating variants to confirm.",
  "new_tests": [ /* TestCase[] */ ],
  "ts": "..."
}
```

### `report`
Final report. Last event before stream closes.
```json
{ "type": "report", "report": { /* Report */ }, "ts": "..." }
```

### `error`
```json
{ "type": "error", "message": "...", "ts": "..." }
```

---

## Core Types

### `AgentCard`
Pass-through of the target's `/.well-known/agent-card.json`. Treat as opaque JSON for rendering — the only fields we guarantee are present (and you should render prominently):

```ts
{
  name: string
  description: string
  url: string                          // JSON-RPC endpoint
  version?: string
  provider?: { organization: string; url: string }
  capabilities?: { streaming?: boolean; pushNotifications?: boolean; stateTransitionHistory?: boolean }
  authentication?: { schemes: string[] }
  securitySchemes?: object
  skills?: Skill[]
  agentCardSignature?: object
  // plus any other fields the agent declares — render them in a collapsed JSON viewer
}

Skill {
  id: string
  name: string
  description: string
  tags?: string[]
  examples?: string[]
  inputModes?: string[]
  outputModes?: string[]
}
```

### `Finding`
```ts
{
  id: string                                          // uuid
  phase: "static" | "behavioral"
  test_type: string                                   // e.g. "prompt_injection", "missing_auth", "unsigned_card"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  passed: boolean                                     // true = agent behaved safely; false = vulnerability triggered
  title: string                                       // short, e.g. "Agent leaked system prompt"
  description: string                                 // 1-2 sentences explaining what happened
  evidence: {
    request?: string                                  // what we sent (omit for static findings)
    response?: string                                 // raw response from target
    highlight?: string                                // the smoking-gun substring inside response
  }
  recommendation: string                              // what the agent owner should fix
  skill_targeted?: string                             // skill id, if applicable
  ts: string
}
```

### `TestCase`
```ts
{
  id: string
  test_type:
    | "prompt_injection"
    | "scope_escape"
    | "canary_exfiltration"
    | "error_disclosure"
    | "role_confusion"
    | "pii_probe"
    | "capability_overstep"
  payload: string                                     // the exact message we send
  what_to_watch: string                               // human-readable: what pass vs fail looks like
  severity_if_triggered: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  skill_targeted: string                              // skill id this test targets (or "global")
}
```

### `Report`
```ts
{
  scan_id: string
  target_url: string
  agent_name: string
  trust_score: number                                 // 0-100
  grade: "TRUSTED" | "CAUTION" | "RISKY" | "DANGEROUS"
  summary: string                                     // 2-3 sentence executive summary
  card: AgentCard
  findings: Finding[]                                 // all findings, ordered by severity desc then ts asc
  stats: {
    total_tests: number
    passed: number
    failed: number
    critical: number
    high: number
    medium: number
    low: number
  }
  duration_ms: number
  ts: string
}
```

---

## Grade thresholds
```
90-100 → TRUSTED    (green)
70-89  → CAUTION    (yellow)
50-69  → RISKY      (orange)
0-49   → DANGEROUS  (red)
```

---

## Suggested UI layout

```
┌─────────────────────────────────────────────────────────────┐
│  [target URL input]                          [Scan button]  │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                       │
│   Agent Card         │   Live Findings Feed                 │
│   (from card_fetched)│   (findings stream in here)          │
│   - name             │                                       │
│   - skills           │   ┌─ CRITICAL ─────────────────┐    │
│   - capabilities     │   │ Agent leaked system prompt │    │
│   - auth             │   │ [evidence expandable]      │    │
│                      │   └────────────────────────────┘    │
│                      │                                       │
│                      │   ┌─ HIGH ─────────────────────┐    │
│                      │   │ ...                        │    │
│                      │                                       │
├──────────────────────┴──────────────────────────────────────┤
│  Trust Score:  72 / 100   CAUTION                            │
│  [animated when report arrives]                              │
└─────────────────────────────────────────────────────────────┘
```

Highlight the `adaptive_followup` event with a special animation — that's the "this is agentic" moment for the judges.

---

## Mock SSE for frontend dev

Backend will provide `GET /stream/mock` that replays a canned scan so the UI engineer can build without the backend being live. Coming in the next push.
