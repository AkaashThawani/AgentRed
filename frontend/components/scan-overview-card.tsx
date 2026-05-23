'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Zap, Bug } from 'lucide-react'
import { ScanPhase, Finding, TestCase } from '@/lib/types'

const PHASE_LABEL: Record<ScanPhase, string> = {
  waiting:     'Initialising',
  fetching:    'Fetching Agent Card',
  static:      'Static Analysis',
  conformance: 'A2A Spec Conformance',
  generating:  'Generating Tests',
  behavioral:  'Behavioral Testing',
  adaptive:    'Adaptive Probes',
  report:      'Scan Complete',
  error:       'Error',
}

const PHASE_DEFAULT_MSG: Partial<Record<ScanPhase, string>> = {
  waiting:     'Waiting to begin…',
  fetching:    'Retrieving and validating the agent card',
  static:      'Analysing card metadata, auth schemes, and capabilities',
  conformance: 'Checking card against the A2A v0.3 spec',
  generating:  'Building targeted behavioural test cases',
  behavioral:  'Running probes against the live agent',
  adaptive:    'Following up on suspicious findings with deeper probes',
  report:     'Results consolidated into the final trust report',
  error:      'An error occurred during the scan',
}

interface ScanOverviewCardProps {
  phase: ScanPhase
  phaseMessage?: string
  findings: Finding[]
  tests: TestCase[]
  scanStartTime: number | null
  scanning: boolean
}

export function ScanOverviewCard({
  phase,
  phaseMessage,
  findings,
  tests,
  scanStartTime,
  scanning,
}: ScanOverviewCardProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!scanStartTime) {
      setElapsed(0)
      return
    }
    // Snap to current elapsed immediately
    setElapsed(Date.now() - scanStartTime)
    // Only keep a live interval while scanning is active
    if (!scanning) return
    const id = setInterval(() => setElapsed(Date.now() - scanStartTime), 250)
    return () => clearInterval(id)
  }, [scanStartTime, scanning])

  const critCount     = findings.filter((f) => f.severity === 'CRITICAL').length
  const highCount     = findings.filter((f) => f.severity === 'HIGH').length
  const medCount      = findings.filter((f) => f.severity === 'MEDIUM').length
  const lowCount      = findings.filter((f) => f.severity === 'LOW').length
  const totalFindings = findings.length

  const testsRunning = tests.filter((t) => t.status === 'running').length
  const testsTotal   = tests.length

  const maxSev = Math.max(critCount, highCount, medCount, lowCount, 1)

  const durationStr = scanStartTime ? `${(elapsed / 1000).toFixed(1)}s` : '—'
  const displayMsg  = phaseMessage || PHASE_DEFAULT_MSG[phase] || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-slate-700/40 rounded-xl p-4 backdrop-blur-sm space-y-3"
    >
      {/* ── Phase header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {scanning && (
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0"
              />
            )}
            <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider">
              {PHASE_LABEL[phase]}
            </span>
          </div>
          {displayMsg && (
            <p className="text-xs text-gray-500 leading-relaxed">{displayMsg}</p>
          )}
        </div>

        {/* Duration timer */}
        <div className="flex items-center gap-1 text-xs text-gray-500 font-mono flex-shrink-0 mt-0.5">
          <Clock className="w-3 h-3 text-slate-400/50" />
          <span>{durationStr}</span>
        </div>
      </div>

      {/* ── Stats: Findings + Tests ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Findings tile */}
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <Bug className="w-3 h-3 text-slate-400/60" />
            <span className="text-xs text-gray-500">Findings</span>
          </div>
          <div className="text-xl font-bold text-white leading-none mb-1">{totalFindings}</div>
          {totalFindings > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {critCount > 0 && (
                <span className="text-xs text-red-400 font-mono font-semibold">{critCount}C</span>
              )}
              {highCount > 0 && (
                <span className="text-xs text-orange-400 font-mono font-semibold">{highCount}H</span>
              )}
              {medCount > 0 && (
                <span className="text-xs text-amber-400 font-mono font-semibold">{medCount}M</span>
              )}
              {lowCount > 0 && (
                <span className="text-xs text-blue-400 font-mono font-semibold">{lowCount}L</span>
              )}
            </div>
          )}
        </div>

        {/* Behavioral tests tile — label clarified so a 0 count doesn't read as
            "the scan did nothing" when behavioral was skipped (e.g. endpoint 404) */}
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3 text-orange-400/60" />
            <span className="text-xs text-gray-500">Behavioral Tests</span>
          </div>
          <div className="text-xl font-bold text-white leading-none mb-1">{testsTotal}</div>
          {testsRunning > 0 ? (
            <div className="flex items-center gap-1">
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              <span className="text-xs text-yellow-400/80 font-mono">{testsRunning} live</span>
            </div>
          ) : testsTotal === 0 && phase !== 'waiting' && phase !== 'fetching' && phase !== 'static' && phase !== 'conformance' ? (
            <span className="text-xs text-gray-500 italic">skipped</span>
          ) : null}
        </div>
      </div>

      {/* ── Risk breakdown bars (only when we have findings) ── */}
      {totalFindings > 0 && (
        <div className="pt-1 space-y-1.5">
          <div className="text-[10px] font-mono text-slate-400/40 uppercase tracking-widest">
            Risk Breakdown
          </div>
          {(
            [
              { label: 'CRIT', count: critCount, bar: 'bg-red-500',    text: 'text-red-400'    },
              { label: 'HIGH', count: highCount, bar: 'bg-orange-500', text: 'text-orange-400' },
              { label: 'MED',  count: medCount,  bar: 'bg-amber-500',  text: 'text-amber-400'  },
              { label: 'LOW',  count: lowCount,  bar: 'bg-blue-500',   text: 'text-blue-400'   },
            ] as const
          ).map(({ label, count, bar, text }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`text-[10px] font-mono w-8 flex-shrink-0 ${text} opacity-70`}>
                {label}
              </span>
              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: count > 0 ? `${(count / maxSev) * 100}%` : '0%' }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`h-full ${bar} rounded-full opacity-80`}
                />
              </div>
              <span className={`text-[10px] font-mono w-3 text-right flex-shrink-0 ${text} opacity-70`}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
