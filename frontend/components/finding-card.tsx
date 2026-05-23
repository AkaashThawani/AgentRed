'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Target, Layers } from 'lucide-react'
import { useState } from 'react'
import { Finding } from '@/lib/types'
import { SeverityBadge } from './severity-badge'

interface FindingCardProps {
  finding: Finding
  index: number
}

const BORDER_COLOR: Record<string, string> = {
  CRITICAL: 'border-red-600/50',
  HIGH:     'border-orange-600/40',
  MEDIUM:   'border-amber-600/30',
  LOW:      'border-blue-600/25',
  PASSED:   'border-teal-600/30',
}


const LEFT_BAR: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-amber-500',
  LOW:      'bg-blue-500',
  PASSED:   'bg-teal-500',
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false)

  const border = BORDER_COLOR[finding.severity] ?? 'border-gray-700/30'
  const bar    = LEFT_BAR[finding.severity] ?? 'bg-gray-600'

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.08, 0.4) }}
      className={`relative rounded-xl border bg-black/50 backdrop-blur-sm overflow-hidden ${border}`}
    >
      {/* Severity accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${bar}`} />

      <div className="pl-3 pr-3 pt-3 pb-3 ml-1">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {/* Badge + test type */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs text-gray-500 font-mono truncate">
                {finding.test_type.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-white leading-snug mb-1.5">
              {finding.title}
            </h3>

            {/* Description — truncated when collapsed */}
            <p
              className={`text-xs text-gray-400 leading-relaxed ${
                expanded ? '' : 'line-clamp-2'
              }`}
            >
              {finding.description}
            </p>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-purple-400/70" />
            </motion.div>
          </button>
        </div>

        {/* Compact meta row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {finding.skill_targeted && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Target className="w-3 h-3 text-purple-400/50" />
              <span className="text-purple-300/60">{finding.skill_targeted}</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Layers className="w-3 h-3 text-purple-400/50" />
            <span className="text-purple-300/60">{finding.phase}</span>
          </span>
        </div>

        {/* Expandable detail section */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                {finding.recommendation && (
                  <div className="bg-purple-950/50 border border-purple-700/30 rounded-lg p-2.5">
                    <div className="text-xs font-semibold text-purple-300 mb-1">Recommendation</div>
                    <p className="text-xs text-purple-200/70 leading-relaxed">
                      {finding.recommendation}
                    </p>
                  </div>
                )}

                {finding.evidence && (
                  <div className="space-y-2">
                    {finding.evidence.request && (
                      <div>
                        <div className="text-xs font-semibold text-purple-300/70 mb-1">Request</div>
                        <div className="bg-black/50 border border-white/[0.06] rounded p-2 text-xs text-gray-400 font-mono leading-relaxed overflow-auto max-h-24">
                          {finding.evidence.request}
                        </div>
                      </div>
                    )}

                    {finding.evidence.response && (
                      <div>
                        <div className="text-xs font-semibold text-purple-300/70 mb-1">Response</div>
                        <div className="bg-black/50 border border-white/[0.06] rounded p-2 text-xs text-gray-400 font-mono leading-relaxed overflow-auto max-h-24">
                          {finding.evidence.response}
                        </div>
                      </div>
                    )}

                    {finding.evidence.smoking_gun && (
                      <div>
                        <div className="text-xs font-semibold text-red-400 mb-1">Smoking Gun</div>
                        <div className="bg-red-950/40 border border-red-700/30 rounded p-2 text-xs text-red-200 font-mono leading-relaxed">
                          {finding.evidence.smoking_gun}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
