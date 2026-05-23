export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED'

export interface Skill {
  /** A2A spec field. Backend forwards as-is. */
  id?: string
  /** Legacy alias — kept so older UI code still compiles. */
  skill_id?: string
  name: string
  description?: string
  tags?: string[]
  examples?: string[]
  inputModes?: string[]
  outputModes?: string[]
  /** Legacy snake_case aliases */
  input_modes?: string[]
  output_modes?: string[]
}

export interface Capability {
  streaming?: boolean
  pushNotifications?: boolean
  stateTransitionHistory?: boolean
}

export interface AgentCard {
  agent_name: string
  description?: string
  endpoint_url?: string
  provider_organization?: string
  provider_url?: string
  version?: string
  authentication_schemes?: string[]
  security_schemes?: Record<string, unknown>
  capabilities?: Capability
  skills?: Skill[]
  /** Cryptographic signature — absence indicates unsigned card */
  signature?: string
}

export interface OwaspLlm {
  id: string     // e.g. "LLM01"
  name: string   // e.g. "Prompt Injection"
  url: string
}

export interface Finding {
  id: string
  severity: Severity
  passed: boolean
  title: string
  phase: string          // "static" | "conformance" | "behavioral"
  test_type: string
  description: string
  skill_targeted?: string
  recommendation?: string
  /** Backend may send `ts` (ISO string) or `timestamp` (number) — accept both */
  timestamp?: number
  ts?: string
  evidence?: {
    request?: string
    response?: string
    highlight?: string       // backend canonical (CONTRACT.md)
    smoking_gun?: string     // legacy alias
  }
  /** Backend-enriched fields (CONTRACT.md) */
  owasp_llm?: OwaspLlm
  reproducer?: string        // copy-pasteable curl
}

export interface TestCase {
  /** Backend's canonical field per CONTRACT.md. Optional only because legacy mock-data uses test_id. */
  id?: string
  /** Legacy alias — older UI components and mock-data reference this */
  test_id?: string
  test_type: string
  payload?: string
  /** Legacy alias */
  payload_preview?: string
  what_to_watch?: string
  severity_if_triggered?: Severity
  skill_targeted?: string
  /** Client-side lifecycle (set by event handlers, not from backend) */
  status?: 'generated' | 'running' | 'completed'
}

export interface Report {
  /** Scan identifier returned by the backend */
  scan_id?: string
  target_url: string
  agent_name: string
  trust_score: number
  grade: 'TRUSTED' | 'CAUTION' | 'RISKY' | 'DANGEROUS'
  summary?: string
  /** Agent card as fetched during the scan */
  card?: AgentCard
  stats?: {
    total_tests: number
    passed: number
    failed: number
    /** Findings from static (non-behavioural) analysis */
    static_findings?: number
    critical: number
    high: number
    medium: number
    low: number
    /** Legacy — duration in ms, some backends put it here */
    duration?: number
  }
  /** Scan duration in milliseconds (top-level, preferred) */
  duration_ms?: number
  /** ISO timestamp of when the report was generated */
  ts?: string
  findings?: Finding[]
}

export type ScanPhase =
  | 'waiting'
  | 'fetching'
  | 'static'
  | 'conformance'
  | 'generating'
  | 'behavioral'
  | 'adaptive'
  | 'report'
  | 'error'

export interface ScanStartedEvent {
  type: 'scan_started'
  scan_id: string
  timestamp: number
}

export interface CardFetchedEvent {
  type: 'card_fetched'
  agent_card: AgentCard
  timestamp: number
}

export interface PhaseEvent {
  type: 'phase'
  phase: ScanPhase
  /** Optional human-readable description sent by the backend */
  message?: string
  timestamp: number
}

export interface FindingEvent {
  type: 'finding'
  finding: Finding
  timestamp: number
}

export interface TestGeneratedEvent {
  type: 'test_generated'
  test: TestCase
  timestamp: number
}

export interface TestRunningEvent {
  type: 'test_running'
  test_id: string
  timestamp: number
}

export interface AdaptiveFollowupEvent {
  type: 'adaptive_followup'
  reason: string
  parent_finding_id: string
  new_tests: TestCase[]
  timestamp: number
}

export interface ReportEvent {
  type: 'report'
  report: Report
  timestamp: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
  timestamp: number
}

export type ScanEvent =
  | ScanStartedEvent
  | CardFetchedEvent
  | PhaseEvent
  | FindingEvent
  | TestGeneratedEvent
  | TestRunningEvent
  | AdaptiveFollowupEvent
  | ReportEvent
  | ErrorEvent
