'use client'

import { motion } from 'framer-motion'
import { Severity } from '@/lib/types'

interface SeverityBadgeProps {
  severity: Severity
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const colorMap: Record<Severity, string> = {
    CRITICAL: 'bg-red-900/40 text-red-300 border-red-700/60 shadow-lg shadow-red-900/40',
    HIGH: 'bg-orange-900/40 text-orange-300 border-orange-700/60 shadow-lg shadow-orange-900/30',
    MEDIUM: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
    LOW: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
    PASSED: 'bg-teal-900/40 text-teal-300 border-teal-700/60',
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex px-2 py-1 rounded text-xs font-semibold border ${colorMap[severity]}`}
    >
      {severity}
    </motion.div>
  )
}

interface StatusPillProps {
  status: 'online' | 'offline' | 'mock'
}

export function StatusPill({ status }: StatusPillProps) {
  const colorMap = {
    online: 'bg-teal-900/40 text-teal-300 border-teal-700/60',
    offline: 'bg-gray-900/40 text-gray-400 border-gray-700/60',
    mock: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
  }

  const dotMap = {
    online: 'bg-teal-400',
    offline: 'bg-gray-500',
    mock: 'bg-purple-400',
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${colorMap[status]}`}
    >
      <div className={`w-2 h-2 rounded-full ${dotMap[status]} ${status === 'online' ? 'animate-pulse' : ''}`} />
      {status === 'online' && 'Online'}
      {status === 'offline' && 'Offline'}
      {status === 'mock' && 'Mock Mode'}
    </div>
  )
}
