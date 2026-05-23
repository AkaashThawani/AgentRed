'use client'

import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { ScanEvent } from '@/lib/types'

interface LiveEventRailProps {
  events: ScanEvent[]
}

export function LiveEventRail({ events }: LiveEventRailProps) {
  const [collapsed, setCollapsed] = useState(false)

  const getEventIcon = (type: string) => {
    const icons: Record<string, string> = {
      scan_started: '▶',
      card_fetched: '📋',
      phase: '⚙',
      finding: '⚠',
      test_generated: '🔬',
      test_running: '🏃',
      adaptive_followup: '🧠',
      report: '📊',
      error: '❌',
    }
    return icons[type] || '●'
  }

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      scan_started: 'text-teal-400',
      card_fetched: 'text-slate-400',
      phase: 'text-blue-400',
      finding: 'text-orange-400',
      test_generated: 'text-cyan-400',
      test_running: 'text-yellow-400',
      adaptive_followup: 'text-pink-400',
      report: 'text-green-400',
      error: 'text-red-400',
    }
    return colors[type] || 'text-gray-400'
  }

  const formatEventLabel = (type: string) => {
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  return (
    <motion.div
      className="border border-slate-700/40 rounded-lg bg-card/40 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-800/10 transition-colors border-b border-slate-700/20"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-300/60">LIVE EVENTS</span>
          <span className="text-xs font-bold px-2 py-1 bg-slate-800/40 border border-slate-700/60 rounded text-slate-300">
            {events.length}
          </span>
        </div>
        <ChevronDown
          className="w-4 h-4 text-slate-300 transition-transform"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Events list */}
      {!collapsed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="max-h-80 overflow-y-auto"
        >
          <div className="p-4 space-y-2">
            {[...events].reverse().map((event, idx) => (
              <motion.div
                key={`${event.type}-${idx}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="flex items-start gap-3 p-2 rounded bg-black/20 hover:bg-black/40 transition-colors border border-transparent hover:border-slate-700/20"
              >
                <span className={`text-lg ${getEventColor(event.type)} flex-shrink-0`}>{getEventIcon(event.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-300">{formatEventLabel(event.type)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
