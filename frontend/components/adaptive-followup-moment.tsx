'use client'

import { motion } from 'framer-motion'
import { Brain, Zap } from 'lucide-react'
import { TestCase } from '@/lib/types'

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ pointerEvents: 'none' }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        className="relative bg-gradient-to-b from-purple-900/80 to-purple-950/80 border border-purple-500/60 rounded-lg p-6 max-w-md shadow-2xl shadow-purple-900/60"
        style={{
          boxShadow: '0 0 40px rgba(139, 92, 246, 0.6), 0 0 60px rgba(139, 92, 246, 0.3)',
          pointerEvents: 'auto',
        }}
      >
        {/* Animated background */}
        <motion.div
          className="absolute inset-0 rounded-lg opacity-30"
          animate={{
            background: [
              'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Header with icon */}
        <div className="relative z-10 mb-4 flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Brain className="w-6 h-6 text-purple-300" />
          </motion.div>
          <h3 className="text-lg font-bold text-white">Adaptive Follow-up Triggered</h3>
        </div>

        {/* Reason */}
        <p className="relative z-10 text-sm text-purple-200 mb-4">
          {reason}
        </p>

        {/* New tests with branching visual */}
        {newTests.length > 0 && (
          <div className="relative z-10 space-y-3">
            <div className="text-xs font-semibold text-purple-300 mb-2">New Adaptive Probes</div>

            {newTests.map((test, idx) => (
              <motion.div
                key={test.test_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-start gap-3"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: idx * 0.2 }}
                  className="flex-shrink-0 mt-1"
                >
                  <Zap className="w-4 h-4 text-orange-400" />
                </motion.div>
                <div className="bg-purple-900/40 border border-purple-700/40 rounded p-2 flex-1">
                  <div className="text-xs font-semibold text-purple-300">{test.test_type.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-400 mt-1">{test.what_to_watch}</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Sparkle animations */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-purple-400 rounded-full"
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              y: [0, -50, -100],
              x: [Math.cos((i / 3) * Math.PI * 2) * 50, Math.cos((i / 3) * Math.PI * 2) * 100, Math.cos((i / 3) * Math.PI * 2) * 150],
            }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            style={{
              left: '50%',
              top: '50%',
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}
