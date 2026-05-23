'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Target, Layers, ShieldAlert, Copy, Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Finding } from '@/lib/types'
import { SeverityBadge } from './severity-badge'

/** Render a string with the `highlight` substring (case-sensitive) wrapped in red. */
function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>
  const [before, ...rest] = text.split(highlight)
  return (
    <>
      {before}
      <mark className="bg-red-500/30 text-red-100 px-0.5 rounded">{highlight}</mark>
      {rest.join(highlight)}
    </>
  )
}

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
  const [copiedRepro, setCopiedRepro] = useState(false)

  const border = BORDER_COLOR[finding.severity] ?? 'border-gray-700/30'
  const bar    = LEFT_BAR[finding.severity] ?? 'bg-gray-600'

  const highlight = finding.evidence?.highlight ?? finding.evidence?.smoking_gun

  const copyReproducer = () => {
    if (!finding.reproducer) return
    navigator.clipboard.writeText(finding.reproducer)
    setCopiedRepro(true)
    setTimeout(() => setCopiedRepro(false), 1800)
  }

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
            {/* Badge + test type + OWASP */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs text-gray-500 font-mono truncate">
                {finding.test_type.replace(/_/g, ' ')}
              </span>
              {finding.owasp_llm && (
                <a
                  href={finding.owasp_llm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-900/40 border border-indigo-700/40 text-indigo-300 hover:bg-indigo-900/60 transition-colors"
                  title={`OWASP LLM Top 10: ${finding.owasp_llm.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ShieldAlert className="w-2.5 h-2.5" />
                  {finding.owasp_llm.id}
                  <ExternalLink className="w-2 h-2 opacity-60" />
                </a>
              )}
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
              <ChevronDown className="w-4 h-4 text-slate-400/70" />
            </motion.div>
          </button>
        </div>

        {/* Compact meta row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {finding.skill_targeted && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Target className="w-3 h-3 text-slate-400/50" />
              <span className="text-slate-300/60">{finding.skill_targeted}</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Layers className="w-3 h-3 text-slate-400/50" />
            <span className="text-slate-300/60">{finding.phase}</span>
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
                  <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-2.5">
                    <div className="text-xs font-semibold text-slate-300 mb-1">Recommendation</div>
                    <p className="text-xs text-slate-200/70 leading-relaxed">
                      {finding.recommendation}
                    </p>
                  </div>
                )}

                {finding.evidence && (
                  <div className="space-y-2">
                    {finding.evidence.request && (
                      <div>
                        <div className="text-xs font-semibold text-slate-300/70 mb-1">Request</div>
                        <div className="bg-black/50 border border-white/[0.06] rounded p-2 text-xs text-gray-400 font-mono leading-relaxed overflow-auto max-h-24 whitespace-pre-wrap">
                          <HighlightedText text={finding.evidence.request} highlight={highlight} />
                        </div>
                      </div>
                    )}

                    {finding.evidence.response && (
                      <div>
                        <div className="text-xs font-semibold text-slate-300/70 mb-1">Response</div>
                        <div className="bg-black/50 border border-white/[0.06] rounded p-2 text-xs text-gray-400 font-mono leading-relaxed overflow-auto max-h-24 whitespace-pre-wrap">
                          <HighlightedText text={finding.evidence.response} highlight={highlight} />
                        </div>
                      </div>
                    )}

                    {highlight && (
                      <div>
                        <div className="text-xs font-semibold text-red-400 mb-1">Smoking Gun</div>
                        <div className="bg-red-950/40 border border-red-700/30 rounded p-2 text-xs text-red-200 font-mono leading-relaxed break-all">
                          {highlight}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {finding.reproducer && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xs font-semibold text-emerald-300/80">Reproducer</div>
                      <button
                        onClick={copyReproducer}
                        className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/60 transition-colors"
                        title="Copy curl command"
                      >
                        {copiedRepro ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy curl
                          </>
                        )}
                      </button>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-700/20 rounded p-2 text-[11px] text-emerald-100/80 font-mono leading-relaxed overflow-auto max-h-32 whitespace-pre-wrap break-all">
                      {finding.reproducer}
                    </div>
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
