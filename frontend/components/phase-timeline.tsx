'use client'

import { motion } from 'framer-motion'
import { Check, Circle } from 'lucide-react'
import { ScanPhase } from '@/lib/types'

interface PhaseTimelineProps {
  currentPhase: ScanPhase
}

const PHASES: ScanPhase[] = ['fetching', 'static', 'generating', 'behavioral', 'adaptive', 'report']

export function PhaseTimeline({ currentPhase }: PhaseTimelineProps) {
  const phaseLabels: Record<ScanPhase, string> = {
    waiting: 'Start',
    fetching: 'Fetch Card',
    static: 'Static Analysis',
    generating: 'Generate Tests',
    behavioral: 'Behavioral Testing',
    adaptive: 'Adaptive Follow-up',
    report: 'Report',
    error: 'Error',
  }

  const getCurrentIndex = () => PHASES.indexOf(currentPhase as any)
  const currentIndex = getCurrentIndex()

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        {PHASES.map((phase, idx) => (
          <motion.div key={phase} className="flex-1 flex flex-col items-center">
            <motion.div
              animate={{
                backgroundColor: idx < currentIndex ? '#10b981' : idx === currentIndex ? '#8b5cf6' : '#374151',
                boxShadow:
                  idx < currentIndex || idx === currentIndex ? '0 0 20px rgba(139, 92, 246, 0.4)' : 'none',
              }}
              transition={{ duration: 0.3 }}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-purple-500/30 mb-2"
            >
              {idx < currentIndex ? (
                <Check className="w-5 h-5 text-white" />
              ) : (
                <Circle className="w-5 h-5" fill="currentColor" />
              )}
            </motion.div>
            <div className="text-xs text-center text-purple-300 font-mono">{phaseLabels[phase]}</div>
          </motion.div>
        ))}
      </div>

      {/* Connection line */}
      <div className="relative h-1 -mt-12 flex items-center">
        <motion.div
          animate={{ width: `${((currentIndex + 1) / PHASES.length) * 100}%` }}
          transition={{ duration: 0.5 }}
          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
          style={{
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.6)',
          }}
        />
      </div>
    </div>
  )
}
