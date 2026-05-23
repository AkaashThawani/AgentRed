'use client'

import { motion } from 'framer-motion'
import { Globe, RotateCcw, Wifi, WifiOff, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScanPhase } from '@/lib/types'

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

// Single subdued palette — all working phases share the same slate look; only error / report
// get a distinct accent so terminal states are obvious.
const PHASE_STYLE: Record<ScanPhase, string> = {
  waiting:     'text-slate-400 bg-slate-900/40 border-slate-700/40',
  fetching:    'text-slate-300 bg-slate-800/40 border-slate-700/40',
  static:      'text-slate-300 bg-slate-800/40 border-slate-700/40',
  conformance: 'text-slate-300 bg-slate-800/40 border-slate-700/40',
  generating:  'text-slate-300 bg-slate-800/40 border-slate-700/40',
  behavioral:  'text-slate-300 bg-slate-800/40 border-slate-700/40',
  adaptive:    'text-slate-300 bg-slate-800/40 border-slate-700/40',
  report:      'text-emerald-300 bg-emerald-900/20 border-emerald-700/30',
  error:       'text-red-300 bg-red-900/30 border-red-700/40',
}

/* ── Progress bar config ── */
const PROGRESS_PHASES: ScanPhase[] = [
  'fetching', 'static', 'generating', 'behavioral', 'adaptive', 'report',
]
const PROGRESS_LABELS = ['Fetch Card', 'Static', 'Generate', 'Behavioral', 'Adaptive', 'Report']
const PROGRESS_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
]

/** Phase order index; waiting / error map to -1 (nothing lit) */
const PHASE_IDX: Partial<Record<ScanPhase, number>> = {
  fetching: 0, static: 1, generating: 2, behavioral: 3, adaptive: 4, report: 5,
}

interface ScanCommandBarProps {
  targetUrl: string
  phase: ScanPhase
  scanning: boolean
  backendStatus: 'online' | 'offline' | 'mock'
  onNewScan: () => void
}

export function ScanCommandBar({
  targetUrl,
  phase,
  scanning,
  backendStatus,
  onNewScan,
}: ScanCommandBarProps) {
  const isLive       = scanning && phase !== 'error'
  const currentIdx   = PHASE_IDX[phase] ?? -1
  const showProgress = phase !== 'waiting' && phase !== 'error'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 bg-black/70 border border-slate-700/30 rounded-xl backdrop-blur-xl overflow-hidden"
    >
      {/* ── Top row ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        {/* Target URL */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Globe className="w-3.5 h-3.5 text-slate-400/70 flex-shrink-0" />
          {targetUrl ? (
            <span className="text-xs text-gray-300 font-mono truncate">{targetUrl}</span>
          ) : (
            <span className="text-xs text-slate-300/50 font-mono italic">Demo scan</span>
          )}
        </div>

        {/* Phase pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${PHASE_STYLE[phase]}`}
        >
          {isLive && (
            <motion.div
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-current"
            />
          )}
          {!isLive && phase === 'report' && <Activity className="w-3 h-3" />}
          {PHASE_LABEL[phase]}
        </div>

        {/* Backend status */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
            backendStatus === 'online'
              ? 'text-teal-300 bg-teal-900/30 border-teal-700/40'
              : backendStatus === 'mock'
              ? 'text-slate-300 bg-slate-800/30 border-slate-700/40'
              : 'text-gray-400 bg-gray-900/30 border-gray-700/40'
          }`}
        >
          {backendStatus === 'offline' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
          {backendStatus === 'online' ? 'Live' : backendStatus === 'mock' ? 'Demo' : 'Offline'}
        </div>

        {/* New scan */}
        <Button
          onClick={onNewScan}
          size="sm"
          variant="outline"
          className="border-slate-700/40 hover:bg-slate-800/20 text-slate-300 text-xs h-7 px-2.5"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          New Scan
        </Button>
      </div>

      {/* ── Progress bar row ── */}
      {showProgress && (
        <div className="px-4 pb-2.5 flex items-end gap-1">
          {PROGRESS_PHASES.map((p, idx) => {
            const isDone   = idx < currentIdx
            const isActive = idx === currentIdx
            return (
              <div key={p} className="flex-1 flex flex-col gap-[3px]">
                <div
                  className={`h-[3px] w-full rounded-full transition-colors duration-500 ${
                    isDone
                      ? `${PROGRESS_COLORS[idx]} opacity-60`
                      : isActive
                      ? PROGRESS_COLORS[idx]
                      : 'bg-white/[0.06]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      className="h-full w-full rounded-full bg-white/40"
                      animate={{ opacity: [0.3, 0.8, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                </div>
                <span
                  className={`text-[9px] font-mono leading-tight truncate ${
                    isActive ? 'text-slate-300' : isDone ? 'text-gray-500' : 'text-gray-700'
                  }`}
                >
                  {PROGRESS_LABELS[idx]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
