'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { History, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { fetchHistory, HistoryRow } from '@/lib/api'

interface PastScansPanelProps {
  targetUrl: string | null
  /** Bump this when a new scan completes to trigger a re-fetch. */
  refreshKey?: number | string
}

const GRADE_COLOR: Record<HistoryRow['grade'], string> = {
  TRUSTED:   'text-emerald-400',
  CAUTION:   'text-amber-400',
  RISKY:     'text-orange-400',
  DANGEROUS: 'text-red-400',
}

export function PastScansPanel({ targetUrl, refreshKey }: PastScansPanelProps) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!targetUrl) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetchHistory(targetUrl, 10)
      .then((r) => !cancelled && setRows(r))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [targetUrl, refreshKey])

  // Don't render anything if ClickHouse isn't configured (no history available).
  if (!targetUrl || (!loading && rows.length === 0)) return null

  // Compare latest two scans for the trend arrow
  const latest = rows[0]
  const previous = rows[1]
  const delta = latest && previous ? latest.trust_score - previous.trust_score : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-slate-700/40 rounded-xl p-4 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <History className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-mono text-slate-400/70 uppercase tracking-widest">
          Past Scans · This Target
        </span>
        <span className="ml-auto text-[10px] text-slate-500 font-mono">ClickHouse</span>
      </div>

      {previous && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-slate-800/30 border border-slate-700/30 rounded-lg">
          {delta > 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : delta < 0 ? (
            <TrendingDown className="w-4 h-4 text-red-400" />
          ) : (
            <Minus className="w-4 h-4 text-slate-500" />
          )}
          <span className="text-xs text-slate-300">
            Trust score{' '}
            {delta > 0
              ? `improved by ${delta}`
              : delta < 0
              ? `dropped by ${Math.abs(delta)}`
              : 'unchanged'}{' '}
            since previous scan
          </span>
        </div>
      )}

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {rows.map((row, idx) => (
          <div
            key={row.scan_id}
            className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.03] rounded transition-colors"
          >
            <div className={`text-base font-bold font-mono w-10 ${GRADE_COLOR[row.grade]}`}>
              {row.trust_score}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-mono uppercase tracking-wide ${GRADE_COLOR[row.grade]}`}>
                {row.grade}
              </div>
              <div className="text-xs text-slate-500 font-mono truncate">
                {new Date(row.ts * 1000).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono flex-shrink-0">
              {row.critical > 0 && <span className="text-red-400">{row.critical}C</span>}
              {row.high > 0 && <span className="text-orange-400">{row.high}H</span>}
              {row.medium > 0 && <span className="text-amber-400">{row.medium}M</span>}
              {row.low > 0 && <span className="text-blue-400">{row.low}L</span>}
              {idx === 0 && (
                <span className="ml-1 px-1 rounded bg-emerald-900/40 border border-emerald-700/40 text-emerald-300">
                  latest
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
