'use client'

import { motion } from 'framer-motion'
import { Brain, Zap } from 'lucide-react'
import { TestCase } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* Overlay (timed "wow moment" when adaptive_followup first fires)      */
/* ------------------------------------------------------------------ */

interface AdaptiveFollowupMomentProps {
  reason: string
  newTests: TestCase[]
}

export function AdaptiveFollowupMoment({ reason, newTests }: AdaptiveFollowupMomentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        className="relative bg-gradient-to-b from-purple-900/80 to-purple-950/90 border border-purple-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        style={{
          boxShadow: '0 0 50px rgba(139,92,246,0.6), 0 0 100px rgba(139,92,246,0.25)',
          pointerEvents: 'auto',
        }}
      >
        {/* Animated ambient gradient */}
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-40 pointer-events-none"
          animate={{
            background: [
              'radial-gradient(circle at 0% 0%,   rgba(139,92,246,0.15) 0%, transparent 60%)',
              'radial-gradient(circle at 100% 100%, rgba(139,92,246,0.15) 0%, transparent 60%)',
              'radial-gradient(circle at 0% 0%,   rgba(139,92,246,0.15) 0%, transparent 60%)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3 mb-3">
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Brain className="w-6 h-6 text-purple-300" />
          </motion.div>
          <div>
            <h3 className="text-base font-bold text-white">Adaptive Follow-up Triggered</h3>
            <p className="text-xs text-purple-400/70">Scanner detected suspicious behaviour — generating deeper probes</p>
          </div>
        </div>

        {/* Reason */}
        <p className="relative z-10 text-sm text-purple-200/80 mb-4 leading-relaxed">{reason}</p>

        {/* New tests */}
        {newTests.length > 0 && (
          <div className="relative z-10 space-y-2">
            <div className="text-xs font-semibold text-purple-300/70 uppercase tracking-wider mb-2">
              {newTests.length} New Adaptive {newTests.length === 1 ? 'Probe' : 'Probes'}
            </div>
            {newTests.map((test, idx) => (
              <motion.div
                key={test.id ?? test.test_id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center gap-3 bg-purple-900/40 border border-purple-700/40 rounded-lg p-2.5"
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: idx * 0.2 }}
                >
                  <Zap className="w-4 h-4 text-orange-400 flex-shrink-0" />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-purple-200">
                    {test.test_type.replace(/_/g, ' ')}
                  </div>
                  {test.what_to_watch && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">{test.what_to_watch}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Sparkles */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 bg-purple-400 rounded-full pointer-events-none"
            animate={{
              opacity:  [0, 1, 0],
              scale:    [0, 1, 0],
              y:        [0, -40, -80],
              x:        [Math.cos((i / 3) * Math.PI * 2) * 40, Math.cos((i / 3) * Math.PI * 2) * 80],
            }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.35 }}
            style={{ left: '50%', top: '50%' }}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline card — persistent record in the center column                */
/* ------------------------------------------------------------------ */

interface AdaptiveInlineCardProps {
  reason: string
  newTests: TestCase[]
}

export function AdaptiveInlineCard({ reason, newTests }: AdaptiveInlineCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-gradient-to-br from-purple-950/70 to-purple-900/30 border border-purple-500/40 rounded-xl p-4 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain className="w-4 h-4 text-purple-300" />
        </motion.div>
        <span className="text-sm font-semibold text-purple-200">Adaptive Follow-up</span>
        <span className="ml-auto text-xs text-purple-400/50 font-mono">
          {newTests.length} probe{newTests.length !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="text-xs text-purple-300/60 leading-relaxed mb-3">{reason}</p>

      {/* Probe list */}
      <div className="space-y-1.5">
        {newTests.slice(0, 4).map((test) => (
          <div
            key={test.id ?? test.test_id}
            className="flex items-center gap-2 text-xs"
          >
            <Zap className="w-3 h-3 text-orange-400/80 flex-shrink-0" />
            <span className="font-mono text-purple-200/70 truncate">
              {test.test_type.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
        {newTests.length > 4 && (
          <div className="text-xs text-purple-500/50 pl-5">
            +{newTests.length - 4} more
          </div>
        )}
      </div>
    </motion.div>
  )
}
