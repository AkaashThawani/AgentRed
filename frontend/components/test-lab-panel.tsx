'use client'

import { motion } from 'framer-motion'
import { FlaskConical } from 'lucide-react'
import { TestCase, Severity } from '@/lib/types'

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-orange-400',
  MEDIUM:   'text-amber-400',
  LOW:      'text-blue-400',
  PASSED:   'text-teal-400',
}

const STATUS_DOT: Record<NonNullable<TestCase['status']>, { bg: string; pulse: boolean; label: string }> = {
  generated: { bg: 'bg-purple-500',  pulse: false, label: 'Queued'  },
  running:   { bg: 'bg-yellow-400',  pulse: true,  label: 'Running' },
  completed: { bg: 'bg-teal-500',    pulse: false, label: 'Done'    },
}

interface TestLabPanelProps {
  tests: TestCase[]
}

export function TestLabPanel({ tests }: TestLabPanelProps) {
  const runningCount = tests.filter((t) => t.status === 'running').length

  return (
    <div className="bg-black/50 border border-slate-700/40 rounded-xl overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/20">
        <FlaskConical className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-mono text-slate-400/70 uppercase tracking-widest">Test Lab</span>

        <div className="ml-auto flex items-center gap-2">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-300/80">
              <motion.div
                animate={{ opacity: [1, 0.2, 1], scale: [1, 1.3, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              {runningCount} running
            </span>
          )}
          <span className="px-1.5 py-0.5 bg-slate-800/40 border border-slate-700/40 rounded text-xs text-slate-300">
            {tests.length}
          </span>
        </div>
      </div>

      {/* Test rows */}
      <div className="max-h-52 overflow-y-auto divide-y divide-white/[0.04]">
        {tests.map((test, idx) => {
          const sc = STATUS_DOT[test.status ?? 'generated']
          return (
            <motion.div
              key={test.id ?? test.test_id ?? `test-${idx}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(idx * 0.04, 0.3) }}
              className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors"
            >
              {/* Status dot */}
              <motion.div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.bg}`}
                animate={sc.pulse ? { opacity: [1, 0.2, 1], scale: [1, 1.4, 1] } : {}}
                transition={sc.pulse ? { duration: 0.8, repeat: Infinity } : {}}
              />

              {/* Test info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-slate-200 truncate">
                  {test.test_type.replace(/_/g, ' ')}
                </div>
                {test.what_to_watch && (
                  <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">
                    {test.what_to_watch}
                  </div>
                )}
              </div>

              {/* Severity if triggered */}
              {test.severity_if_triggered && (
                <span
                  className={`text-xs font-mono flex-shrink-0 ${SEVERITY_COLOR[test.severity_if_triggered]}`}
                >
                  {test.severity_if_triggered}
                </span>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
