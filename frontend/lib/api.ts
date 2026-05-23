import { Report } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

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
    throw new Error(`Failed to start scan: ${response.statusText}`)
  }

  const data = await response.json()
  return {
    scan_id: data.scan_id,
    stream_url: data.stream_url.startsWith('/') ? `${API_BASE_URL}${data.stream_url}` : data.stream_url,
  }
}

export function openScanStream(streamUrl: string, onEvent: (event: string, data: unknown) => void, onError: (error: Error) => void): EventSource {
  const eventSource = new EventSource(streamUrl)

  eventSource.addEventListener('scan_started', (event) => {
    onEvent('scan_started', JSON.parse(event.data))
  })
  eventSource.addEventListener('card_fetched', (event) => {
    onEvent('card_fetched', JSON.parse(event.data))
  })
  eventSource.addEventListener('phase', (event) => {
    onEvent('phase', JSON.parse(event.data))
  })
  eventSource.addEventListener('finding', (event) => {
    onEvent('finding', JSON.parse(event.data))
  })
  eventSource.addEventListener('test_generated', (event) => {
    onEvent('test_generated', JSON.parse(event.data))
  })
  eventSource.addEventListener('test_running', (event) => {
    onEvent('test_running', JSON.parse(event.data))
  })
  eventSource.addEventListener('adaptive_followup', (event) => {
    onEvent('adaptive_followup', JSON.parse(event.data))
  })
  eventSource.addEventListener('report', (event) => {
    onEvent('report', JSON.parse(event.data))
  })
  eventSource.addEventListener('error', (event) => {
    onEvent('error', JSON.parse(event.data))
  })

  eventSource.onerror = () => {
    onError(new Error('EventSource connection error'))
    eventSource.close()
  }

  return eventSource
}

export async function downloadReportJson(report: Report): Promise<void> {
  const element = document.createElement('a')
  element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2)))
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
