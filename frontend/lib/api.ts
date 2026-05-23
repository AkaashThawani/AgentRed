import { Report } from './types'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`)
    return response.ok && (await response.json()).ok === true
  } catch {
    return false
  }
}

export async function startScan(targetUrl: string): Promise<{ scan_id: string; stream_url: string }> {
  const response = await fetch(`${API_BASE_URL}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url: targetUrl }),
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
  // Track whether the scan completed normally so we can ignore the
  // onerror that fires when the server closes the connection after report.
  let completed = false

  const makeHandler = (eventType: string) => (event: MessageEvent) => {
    try {
      onEvent(eventType, JSON.parse(event.data))
    } catch {
      onError(new Error(`Malformed ${eventType} event data`))
    }
  }

  eventSource.addEventListener('scan_started', makeHandler('scan_started'))
  eventSource.addEventListener('card_fetched', makeHandler('card_fetched'))
  eventSource.addEventListener('phase', makeHandler('phase'))
  eventSource.addEventListener('finding', makeHandler('finding'))
  eventSource.addEventListener('test_generated', makeHandler('test_generated'))
  eventSource.addEventListener('test_running', makeHandler('test_running'))
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

  // Backend "error" SSE event (named, with JSON payload). Distinct from EventSource's
  // built-in transport error which has no data and fires on close/network failure.
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

  // Network / connection-level error — ignore if scan already completed normally.
  // EventSource also fires onerror when the server closes the stream after sending
  // the final report, so we must not treat that as a failure.
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
  element.setAttribute('download', `report-${Date.now()}.json`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export async function copyReportSummary(report: Report): Promise<void> {
  const summary = `
Agent Scanner Report
====================
Agent: ${report.agent_name}
Trust Score: ${report.trust_score}/100 (${report.grade})
URL: ${report.target_url}

Summary: ${report.summary || 'No summary available'}

Stats:
- Total Tests: ${report.stats?.total_tests || 0}
- Passed: ${report.stats?.passed || 0}
- Failed: ${report.stats?.failed || 0}
- Critical: ${report.stats?.critical || 0}
- High: ${report.stats?.high || 0}
- Duration: ${report.stats?.duration || 'N/A'}ms
  `.trim()

  try {
    await navigator.clipboard.writeText(summary)
  } catch {
    console.error('Failed to copy summary')
  }
}
