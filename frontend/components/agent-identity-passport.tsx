'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { AgentCard } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

interface AgentIdentityPassportProps {
  agentCard: AgentCard | null
  loading?: boolean
}

export function AgentIdentityPassport({ agentCard, loading }: AgentIdentityPassportProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(agentCard, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !agentCard) {
    return (
      <div className="border border-purple-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="border border-purple-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm shadow-lg shadow-purple-900/30"
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-1">Agent Identity Passport</h3>
        <p className="text-xs text-purple-300/60 font-mono">Behavioral Trust Profile</p>
      </div>

      {/* Main info */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 font-semibold uppercase">Agent Name</label>
          <p className="text-base font-semibold text-purple-200">{agentCard.agent_name}</p>
        </div>

        {agentCard.description && (
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Description</label>
            <p className="text-sm text-gray-300">{agentCard.description}</p>
          </div>
        )}

        {agentCard.endpoint_url && (
          <div>
            <label className="text-xs text-gray-500 font-semibold uppercase">Endpoint</label>
            <p className="text-xs text-purple-300 font-mono break-all">{agentCard.endpoint_url}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {agentCard.provider_organization && (
            <div>
              <label className="text-xs text-gray-500 font-semibold uppercase">Provider</label>
              <p className="text-sm text-gray-300">{agentCard.provider_organization}</p>
            </div>
          )}

          {agentCard.version && (
            <div>
              <label className="text-xs text-gray-500 font-semibold uppercase">Version</label>
              <p className="text-sm text-gray-300">{agentCard.version}</p>
            </div>
          )}
        </div>
      </div>

      {/* Capabilities */}
      {agentCard.capabilities && (
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-semibold uppercase mb-2 block">Capabilities</label>
          <div className="flex flex-wrap gap-2">
            {agentCard.capabilities.streaming && (
              <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
                Streaming
              </span>
            )}
            {agentCard.capabilities.pushNotifications && (
              <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
                Push Notifications
              </span>
            )}
            {agentCard.capabilities.stateTransitionHistory && (
              <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300">
                State History
              </span>
            )}
          </div>
        </div>
      )}

      {/* Skills */}
      {agentCard.skills && agentCard.skills.length > 0 && (
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-semibold uppercase mb-2 block">Skills</label>
          <div className="space-y-2">
            {agentCard.skills.map((skill) => (
              <motion.div
                key={skill.skill_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-purple-900/10 border border-purple-700/30 rounded p-2"
              >
                <div className="font-semibold text-sm text-purple-300">{skill.name}</div>
                <div className="text-xs text-gray-400">{skill.description}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON viewer */}
      <div
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        role="button"
        tabIndex={0}
        className="flex items-center gap-2 w-full p-2 hover:bg-purple-900/10 rounded transition-colors border border-purple-700/20"
      >
        <ChevronDown
          className="w-4 h-4 text-purple-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
        <span className="text-xs font-semibold text-purple-300">Raw Agent Card JSON</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            copyJson()
          }}
          className="ml-auto p-1 hover:bg-purple-900/20 rounded transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4 text-purple-300" />}
        </button>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 bg-black/40 rounded p-2 overflow-auto max-h-64 border border-purple-700/20"
        >
          <pre className="text-xs text-gray-300 font-mono">{JSON.stringify(agentCard, null, 2)}</pre>
        </motion.div>
      )}
    </motion.div>
  )
}
