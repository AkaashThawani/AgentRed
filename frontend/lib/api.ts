import { Report } from './types'

// Route everything through Vercel's same-origin `/api/*` proxy (configured in next.config.mjs)
// so the browser never sees render.com. Ad blockers (uBlock Origin, Brave Shields, corporate
// DNS filters, etc.) commonly block onrender.com outright, which surfaced as
// `net::ERR_BLOCKED_BY_CLIENT` in production. Same-origin requests are immune to that.
// In `next dev` the rewrite forwards `/api/*` to the BACKEND env var (or localhost:8000).
export const API_BASE_URL = '/api'

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`)
    return response.ok && (await response.json()).ok === true
  } catch {
    return false
  }
}

export async function startScan(
  targetUrl: string,
  authHeaders?: Record<string, string>
): Promise<{ scan_id: string; stream_url: string }> {
  // Build request body — only include auth_headers when the caller provides them
  const body: Record<string, unknown> = { target_url: targetUrl }
  if (authHeaders && Object.keys(authHeaders).length > 0) {
    body.auth_headers = authHeaders
    // Never log auth header values
  }

  const response = await fetch(`${API_BASE_URL}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Failed to start scan: ${errorText}`)
  }

  const data = await response.json()
  return {
    scan_id: data.scan_id,
    stream_url: buildStreamUrl(data.stream_url),
  }
}

export function buildStreamUrl(streamUrl: string): string {
  if (!streamUrl) return ''
  return streamUrl.startsWith('/') ? `${API_BASE_URL}${streamUrl}` : streamUrl
}

/** Historical scans from ClickHouse. Returns [] if ClickHouse not configured. */
export interface HistoryRow {
  scan_id: string
  ts: number
  target_url: string
  agent_name: string
  trust_score: number
  grade: 'TRUSTED' | 'CAUTION' | 'RISKY' | 'DANGEROUS'
  duration_ms: number
  critical: number
  high: number
  medium: number
  low: number
  total_tests: number
}

export async function fetchHistory(targetUrl?: string, limit = 20): Promise<HistoryRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (targetUrl) params.set('target_url', targetUrl)
  try {
    const r = await fetch(`${API_BASE_URL}/history?${params}`)
    if (!r.ok) return []
    const data = await r.json()
    return data.results ?? []
  } catch {
    return []
  }
}


export async function fetchReport(scanId: string): Promise<Report> {
  const response = await fetch(`${API_BASE_URL}/report/${scanId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch report: ${response.statusText}`)
  }
  return response.json()
}

export function openScanStream(
  streamUrl: string,
  onEvent: (event: string, data: unknown) => void,
  onError: (error: Error) => void
): EventSource {
  const eventSource = new EventSource(streamUrl)
  let completed = false

  const makeHandler = (eventType: string) => (event: MessageEvent) => {
    try {
      onEvent(eventType, JSON.parse(event.data))
    } catch {
      onError(new Error(`Malformed ${eventType} event data`))
    }
  }

  eventSource.addEventListener('scan_started',   makeHandler('scan_started'))
  eventSource.addEventListener('card_fetched',   makeHandler('card_fetched'))
  eventSource.addEventListener('phase',          makeHandler('phase'))
  eventSource.addEventListener('finding',        makeHandler('finding'))
  eventSource.addEventListener('test_generated', makeHandler('test_generated'))
  eventSource.addEventListener('test_running',   makeHandler('test_running'))
  eventSource.addEventListener('adaptive_followup', makeHandler('adaptive_followup'))

  eventSource.addEventListener('report', (event: MessageEvent) => {
    completed = true
    try {
      onEvent('report', JSON.parse(event.data))
    } catch {
      onError(new Error('Malformed report event data'))
    }
    eventSource.close()
  })

  // Named SSE error event from the backend (event: error\ndata: {...})
  eventSource.addEventListener('error', (event: MessageEvent) => {
    if (event.data) {
      completed = true
      try {
        onEvent('error', JSON.parse(event.data))
      } catch {
        onError(new Error('Malformed error event data'))
      }
      eventSource.close()
    }
  })

  // Transport-level error — ignore when scan already completed normally
  eventSource.onerror = () => {
    if (!completed) {
      onError(new Error('Stream connection failed'))
    }
    eventSource.close()
  }

  return eventSource
}

export async function downloadReportJson(report: Report): Promise<void> {
  const element = document.createElement('a')
  element.setAttribute(
    'href',
    'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2))
  )
  element.setAttribute('download', `agentred-report-${report.scan_id ?? Date.now()}.json`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export async function copyReportSummary(report: Report): Promise<void> {
  const durationMs = report.duration_ms ?? report.stats?.duration
  const durationStr = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : 'N/A'

  const summary = `
AgentRed Scan Report
====================
Agent:       ${report.agent_name}
Trust Score: ${report.trust_score}/100 (${report.grade})
URL:         ${report.target_url}
Scan ID:     ${report.scan_id ?? 'N/A'}

Summary: ${report.summary ?? 'No summary available'}

Stats:
  Total Tests:      ${report.stats?.total_tests ?? 0}
  Passed:           ${report.stats?.passed ?? 0}
  Failed:           ${report.stats?.failed ?? 0}
  Static Findings:  ${report.stats?.static_findings ?? 0}
  Critical:         ${report.stats?.critical ?? 0}
  High:             ${report.stats?.high ?? 0}
  Medium:           ${report.stats?.medium ?? 0}
  Low:              ${report.stats?.low ?? 0}
  Duration:         ${durationStr}
  `.trim()

  try {
    await navigator.clipboard.writeText(summary)
  } catch {
    console.error('Failed to copy report summary')
  }
}
