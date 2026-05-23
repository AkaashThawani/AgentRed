'use client'

import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { ScanPhase } from '@/lib/types'

const STEPS: { phase: ScanPhase; label: string; shortLabel: string }[] = [
  { phase: 'fetching',   label: 'Fetch Card',       shortLabel: 'Fetch'    },
  { phase: 'static',     label: 'Static Analysis',  shortLabel: 'Static'   },
  { phase: 'generating', label: 'Generate Tests',   shortLabel: 'Generate' },
  { phase: 'behavioral', label: 'Behavioral',       shortLabel: 'Behav.'   },
  { phase: 'adaptive',   label: 'Adaptive',         shortLabel: 'Adaptive' },
  { phase: 'report',     label: 'Report',           shortLabel: 'Report'   },
]

const PHASE_ORDER = STEPS.map((s) => s.phase)

interface PhaseTimelineProps {
  currentPhase: ScanPhase
}

export function PhaseTimeline({ currentPhase }: PhaseTimelineProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase as ScanPhase)
  // progress bar fill: 0 when before first step, full when on last step
  const pct = currentIdx < 0 ? 0 : ((currentIdx + 1) / STEPS.length) * 100

  return (
    <div className="w-full select-none">
      {/* Progress track — sits above the nodes via relative/absolute */}
      <div className="relative mb-2">
        {/* Full track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-4 right-4 h-[2px] bg-white/[0.06] rounded-full" />
        {/* Filled portion */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 left-4 h-[2px] rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
          animate={{ width: `calc(${pct}% - 2rem)` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ boxShadow: '0 0 6px rgba(139,92,246,0.7)' }}
        />

        {/* Step nodes */}
        <div className="relative flex items-center justify-between">
          {STEPS.map((step, idx) => {
            const isDone    = currentIdx > idx
            const isActive  = currentIdx === idx
            const isPending = currentIdx < idx

            return (
              <div key={step.phase} className="flex flex-col items-center gap-1">
                {/* Node circle */}
                <motion.div
                  animate={{
                    backgroundColor: isDone
                      ? '#10b981'
                      : isActive
                      ? '#8b5cf6'
                      : '#1a1a2e',
                    borderColor: isDone
                      ? '#10b981'
                      : isActive
                      ? '#8b5cf6'
                      : '#374151',
                    scale: isActive ? 1.15 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 relative"
                  style={
                    isActive
                      ? { boxShadow: '0 0 14px rgba(139,92,246,0.8)' }
                      : isDone
                      ? { boxShadow: '0 0 8px rgba(16,185,129,0.5)' }
                      : undefined
                  }
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : isActive ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-3.5 h-3.5 text-white" />
                    </motion.div>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  )}
                </motion.div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Labels row */}
      <div className="flex items-start justify-between">
        {STEPS.map((step, idx) => {
          const isDone   = currentIdx > idx
          const isActive = currentIdx === idx

          return (
            <div
              key={step.phase}
              className={`flex-1 text-center transition-colors duration-300 ${
                isDone
                  ? 'text-teal-500'
                  : isActive
                  ? 'text-purple-300'
                  : 'text-gray-600'
              }`}
              style={{ fontSize: '0.6rem', lineHeight: '1.2' }}
            >
              {step.shortLabel}
            </div>
          )
        })}
      </div>
    </div>
  )
}
