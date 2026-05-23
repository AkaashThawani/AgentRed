export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED'

export interface Skill {
  skill_id: string
  name: string
  description?: string
  tags?: string[]
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

export interface Finding {
  id: string
  severity: Severity
  passed: boolean
  title: string
  phase: string
  test_type: string
  description: string
  skill_targeted?: string
  recommendation?: string
  timestamp: number
  evidence?: {
    request?: string
    response?: string
    smoking_gun?: string
  }
}

export interface TestCase {
  test_id: string
  test_type: string
  payload_preview?: string
  what_to_watch?: string
  severity_if_triggered?: Severity
  skill_targeted?: string
  status: 'generated' | 'running' | 'completed'
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
