'use client'

import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Finding } from '@/lib/types'
import { SeverityBadge } from './severity-badge'

interface FindingCardProps {
  finding: Finding
  index: number
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false)

  const severityGlowMap = {
    CRITICAL: 'shadow-lg shadow-red-900/50',
    HIGH: 'shadow-lg shadow-orange-900/40',
    MEDIUM: 'shadow-lg shadow-amber-900/30',
    LOW: 'shadow-lg shadow-blue-900/20',
    PASSED: 'shadow-lg shadow-teal-900/30',
  }

  const borderColorMap = {
    CRITICAL: 'border-red-700/40',
    HIGH: 'border-orange-700/40',
    MEDIUM: 'border-amber-700/30',
    LOW: 'border-blue-700/20',
    PASSED: 'border-teal-700/30',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, x: -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`border rounded-lg p-4 bg-card/40 backdrop-blur-sm transition-all ${borderColorMap[finding.severity]} ${severityGlowMap[finding.severity]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs text-purple-300/60 font-mono">{finding.test_type}</span>
          </div>
          <h3 className="font-semibold text-white mb-2">{finding.title}</h3>
          <p className="text-sm text-gray-300 mb-3">{finding.description}</p>

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            {finding.skill_targeted && (
              <div>
                <span className="text-gray-500">Skill:</span>
                <span className="text-purple-300 ml-2">{finding.skill_targeted}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Phase:</span>
              <span className="text-purple-300 ml-2">{finding.phase}</span>
            </div>
          </div>

          {finding.recommendation && (
            <div className="bg-purple-900/20 border border-purple-700/30 rounded p-2 mb-3">
              <p className="text-xs text-purple-200">
                <span className="font-semibold">Recommendation:</span> {finding.recommendation}
              </p>
            </div>
          )}
        </div>

        {finding.evidence && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-2 hover:bg-purple-900/20 rounded transition-colors"
          >
            <ChevronDown
              className="w-5 h-5 text-purple-300 transition-transform"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
        )}
      </div>

      {expanded && finding.evidence && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-purple-700/20 space-y-3"
        >
          {finding.evidence.request && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-purple-300">Request:</div>
              <div className="bg-black/40 p-2 rounded text-xs text-gray-300 font-mono overflow-auto max-h-20">
                {finding.evidence.request}
              </div>
            </div>
          )}

          {finding.evidence.response && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-purple-300">Response:</div>
              <div className="bg-black/40 p-2 rounded text-xs text-gray-300 font-mono overflow-auto max-h-20">
                {finding.evidence.response}
              </div>
            </div>
          )}

          {finding.evidence.smoking_gun && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-red-400">Smoking Gun:</div>
              <div className="bg-red-900/20 border border-red-700/30 p-2 rounded text-xs text-red-200 font-mono">
                {finding.evidence.smoking_gun}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
