'use client'

import { Database, BarChart3, ExternalLink } from 'lucide-react'

/** Small chips linking out to the live sponsor dashboards.
 *  Hidden when the corresponding env var isn't set — so dev mode stays clean. */
export function SponsorLinks() {
  const dd = process.env.NEXT_PUBLIC_DATADOG_DASHBOARD_URL
  const ch = process.env.NEXT_PUBLIC_CLICKHOUSE_CONSOLE_URL

  if (!dd && !ch) return null

  return (
    <div className="flex items-center gap-2 text-xs">
      {dd && (
        <a
          href={dd}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/50 border border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-colors"
          title="Open the live Datadog metrics dashboard for AgentRed"
        >
          <BarChart3 className="w-3 h-3 text-purple-400" />
          <span className="font-mono">Datadog</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </a>
      )}
      {ch && (
        <a
          href={ch}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/50 border border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-colors"
          title="Open the ClickHouse SQL console for the agent_scans table"
        >
          <Database className="w-3 h-3 text-amber-400" />
          <span className="font-mono">ClickHouse</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </a>
      )}
    </div>
  )
}
