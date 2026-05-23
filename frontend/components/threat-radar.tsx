'use client'

import { motion } from 'framer-motion'
import { ScanPhase } from '@/lib/types'

interface RadarNode {
  id: string
  angle: number
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED'
  label?: string
}

interface ThreatRadarProps {
  phase: ScanPhase
  events: RadarNode[]
}

export function ThreatRadar({ phase, events }: ThreatRadarProps) {
  const phaseLabels: Record<ScanPhase, string> = {
    waiting: 'Waiting',
    fetching: 'Fetching Card',
    static: 'Static Analysis',
    conformance: 'Conformance Check',
    generating: 'Generating Tests',
    behavioral: 'Behavioral Testing',
    adaptive: 'Adaptive Probe',
    report: 'Report Generated',
    error: 'Error',
  }

  const severityColors = {
    CRITICAL: '#ff1744',
    HIGH: '#ff9100',
    MEDIUM: '#ffc400',
    LOW: '#2196f3',
    PASSED: '#00e676',
  }

  return (
    <div className="relative w-full aspect-square max-w-md">
      <svg className="w-full h-full" viewBox="0 0 400 400">
        <defs>
          <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.1)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background rings */}
        <circle cx="200" cy="200" r="180" fill="url(#radarGradient)" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1" />
        <circle cx="200" cy="200" r="120" fill="none" stroke="rgba(139, 92, 246, 0.2)" strokeWidth="1" />
        <circle cx="200" cy="200" r="60" fill="none" stroke="rgba(139, 92, 246, 0.2)" strokeWidth="1" />

        {/* Center circle */}
        <circle cx="200" cy="200" r="15" fill="rgba(139, 92, 246, 0.6)" filter="url(#glow)" />

        {/* Pulsing sweep line */}
        <motion.line
          x1="200"
          y1="200"
          x2="200"
          y2="20"
          stroke="rgba(139, 92, 246, 0.5)"
          strokeWidth="2"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '200px 200px' }}
        />

        {/* Event nodes */}
        {events.map((event, idx) => {
          const x = 200 + Math.cos((event.angle * Math.PI) / 180 - Math.PI / 2) * 140
          const y = 200 + Math.sin((event.angle * Math.PI) / 180 - Math.PI / 2) * 140
          const color = event.severity ? severityColors[event.severity] : '#8b5cf6'

          return (
            <motion.g key={event.id}>
              <motion.circle
                cx={x}
                cy={y}
                r="6"
                fill={color}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                filter="url(#glow)"
              />
              {event.severity === 'CRITICAL' && (
                <motion.circle
                  cx={x}
                  cy={y}
                  r="10"
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.5"
                  animate={{ r: 20, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.g>
          )
        })}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
        <div className="text-center">
          <div className="text-xs font-mono text-slate-300/60">PHASE</div>
          <div className="text-lg font-bold text-slate-200">{phaseLabels[phase]}</div>
        </div>
      </div>
    </div>
  )
}
