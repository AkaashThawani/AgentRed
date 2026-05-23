'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { Report } from '@/lib/types'

interface TrustScoreGaugeProps {
  report: Report | null
}

export function TrustScoreGauge({ report }: TrustScoreGaugeProps) {
  if (!report) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Waiting for report...</p>
      </div>
    )
  }

  const gradeColors = {
    TRUSTED: { bg: 'from-teal-900 to-teal-950', text: 'text-teal-200', glow: '#14b8a6' },
    CAUTION: { bg: 'from-amber-900 to-amber-950', text: 'text-amber-200', glow: '#f59e0b' },
    RISKY: { bg: 'from-orange-900 to-orange-950', text: 'text-orange-200', glow: '#f97316' },
    DANGEROUS: { bg: 'from-red-900 to-red-950', text: 'text-red-200', glow: '#ef4444' },
  }

  const colors = gradeColors[report.grade]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-gradient-to-br ${colors.bg} border border-purple-700/40 rounded-lg p-8 text-center shadow-2xl`}
      style={{
        boxShadow: `0 0 40px ${colors.glow}40, 0 0 20px ${colors.glow}20`,
      }}
    >
      <h3 className="text-sm font-mono text-gray-500 uppercase mb-4">Trust Score</h3>

      {/* Circular gauge */}
      <div className="relative w-40 h-40 mx-auto mb-6">
        <svg className="w-full h-full" viewBox="0 0 200 200">
          {/* Background arc */}
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(139, 92, 246, 0.1)" strokeWidth="12" />

          {/* Animated progress arc */}
          <motion.circle
            cx="100"
            cy="100"
            r="80"
            fill="none"
            stroke={colors.glow}
            strokeWidth="12"
            strokeDasharray={`${(report.trust_score / 100) * 502} 502`}
            strokeLinecap="round"
            initial={{ strokeDasharray: '0 502' }}
            animate={{ strokeDasharray: `${(report.trust_score / 100) * 502} 502` }}
            transition={{ duration: 2, ease: 'easeOut' }}
            style={{
              filter: `drop-shadow(0 0 10px ${colors.glow})`,
              transform: 'rotate(-90deg)',
              transformOrigin: '100px 100px',
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-5xl font-bold text-white mb-1"
            >
              {Math.round(report.trust_score)}
            </motion.div>
            <div className="text-xs text-gray-400">/100</div>
          </motion.div>
        </div>
      </div>

      {/* Grade badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className={`inline-block px-6 py-2 rounded-lg font-bold text-lg mb-4 ${colors.text} bg-black/30 border border-current/30`}
      >
        {report.grade}
      </motion.div>

      {/* Verdict text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="text-sm text-gray-300 mb-4"
      >
        {report.grade === 'TRUSTED' && 'Safe to integrate'}
        {report.grade === 'CAUTION' && 'Use with caution'}
        {report.grade === 'RISKY' && 'Risky behavior detected'}
        {report.grade === 'DANGEROUS' && 'Do not trust this agent'}
      </motion.p>

      {/* Stats grid */}
      {report.stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="grid grid-cols-3 gap-2 text-xs"
        >
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">Tests</div>
            <div className="font-bold text-lg text-purple-300">{report.stats.total_tests}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">Passed</div>
            <div className="font-bold text-lg text-teal-300">{report.stats.passed}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">Failed</div>
            <div className="font-bold text-lg text-red-300">{report.stats.failed}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">Critical</div>
            <div className="font-bold text-lg text-red-400">{report.stats.critical}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">High</div>
            <div className="font-bold text-lg text-orange-400">{report.stats.high}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-400">Medium</div>
            <div className="font-bold text-lg text-amber-400">{report.stats.medium}</div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
