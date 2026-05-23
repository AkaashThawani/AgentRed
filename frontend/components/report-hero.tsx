'use client'

import { motion } from 'framer-motion'
import {
  Download,
  Copy,
  RotateCcw,
  Check,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Report } from '@/lib/types'

interface ReportHeroProps {
  report: Report
  onReset: () => void
  onDownload: () => void
  onCopy: () => void
  copied: boolean
}

const GRADE_CFG = {
  TRUSTED: {
    borderClass:  'border-teal-500/40',
    glowColor:    'rgba(20, 184, 166, 0.35)',
    arcColor:     '#14b8a6',
    badgeClass:   'bg-teal-500/15 border-teal-500/40 text-teal-300',
    labelClass:   'text-teal-300',
    Icon:         ShieldCheck,
    tagline:      'Safe to integrate into your workflow',
  },
  CAUTION: {
    borderClass:  'border-amber-500/40',
    glowColor:    'rgba(245, 158, 11, 0.35)',
    arcColor:     '#f59e0b',
    badgeClass:   'bg-amber-500/15 border-amber-500/40 text-amber-300',
    labelClass:   'text-amber-300',
    Icon:         ShieldAlert,
    tagline:      'Proceed with caution — review all findings before use',
  },
  RISKY: {
    borderClass:  'border-orange-500/40',
    glowColor:    'rgba(249, 115, 22, 0.35)',
    arcColor:     '#f97316',
    badgeClass:   'bg-orange-500/15 border-orange-500/40 text-orange-300',
    labelClass:   'text-orange-300',
    Icon:         AlertTriangle,
    tagline:      'Risky behaviour detected — not recommended for production',
  },
  DANGEROUS: {
    borderClass:  'border-red-500/40',
    glowColor:    'rgba(239, 68, 68, 0.35)',
    arcColor:     '#ef4444',
    badgeClass:   'bg-red-500/15 border-red-500/40 text-red-300',
    labelClass:   'text-red-300',
    Icon:         ShieldOff,
    tagline:      'Do not trust this agent — immediate review required',
  },
}

export function ReportHero({ report, onReset, onDownload, onCopy, copied }: ReportHeroProps) {
  const cfg = GRADE_CFG[report.grade]
  const GradeIcon = cfg.Icon
  const r = 44
  const circ = 2 * Math.PI * r
  const dash = circ * (report.trust_score / 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`mb-5 rounded-2xl border ${cfg.borderClass} overflow-hidden`}
      style={{ boxShadow: `0 0 40px ${cfg.glowColor}, 0 0 80px ${cfg.glowColor.replace('0.35', '0.12')}` }}
    >
      {/* Main band */}
      <div className="bg-black/60 backdrop-blur-xl px-5 py-5">
        <div className="flex flex-wrap items-center gap-5">

          {/* Circular score gauge */}
          <div className="relative w-[88px] h-[88px] flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <motion.circle
                cx="50" cy="50" r={r}
                fill="none"
                stroke={cfg.arcColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${circ}`}
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: circ - dash }}
                transition={{ duration: 1.8, ease: 'easeOut', delay: 0.2 }}
                style={{ filter: `drop-shadow(0 0 5px ${cfg.arcColor})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                className="text-2xl font-bold text-white leading-none"
              >
                {report.trust_score}
              </motion.span>
              <span className="text-xs text-gray-500 leading-none mt-0.5">/100</span>
            </div>
          </div>

          {/* Grade + summary */}
          <div className="flex-1 min-w-0 space-y-2">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center gap-2"
            >
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-sm font-bold ${cfg.badgeClass}`}>
                <GradeIcon className="w-4 h-4" />
                {report.grade}
              </div>
              <span className="text-xs text-gray-400">{cfg.tagline}</span>
            </motion.div>

            {report.summary && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-sm text-gray-300 leading-relaxed line-clamp-2"
              >
                {report.summary}
              </motion.p>
            )}
          </div>

          {/* Stat tiles */}
          {report.stats && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="flex gap-2 flex-shrink-0"
            >
              {(
                [
                  { label: 'Tests',  value: report.stats.total_tests, cls: 'text-purple-300' },
                  { label: 'Passed', value: report.stats.passed,      cls: 'text-teal-300'   },
                  { label: 'Failed', value: report.stats.failed,      cls: 'text-red-300'    },
                ] as const
              ).map(({ label, value, cls }) => (
                <div
                  key={label}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-center min-w-[52px]"
                >
                  <div className={`text-xl font-bold leading-none ${cls}`}>{value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom strip: severity counts + action buttons */}
      <div className="bg-black/40 border-t border-white/[0.05] px-5 py-2.5 flex flex-wrap items-center gap-3">
        {/* Severity chips */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {report.stats?.critical != null && report.stats.critical > 0 && (
            <span className="px-2 py-0.5 bg-red-900/40 border border-red-700/40 rounded text-xs text-red-300 font-mono">
              {report.stats.critical}×CRIT
            </span>
          )}
          {report.stats?.high != null && report.stats.high > 0 && (
            <span className="px-2 py-0.5 bg-orange-900/40 border border-orange-700/40 rounded text-xs text-orange-300 font-mono">
              {report.stats.high}×HIGH
            </span>
          )}
          {report.stats?.medium != null && report.stats.medium > 0 && (
            <span className="px-2 py-0.5 bg-amber-900/40 border border-amber-700/40 rounded text-xs text-amber-300 font-mono">
              {report.stats.medium}×MED
            </span>
          )}
          {report.stats?.low != null && report.stats.low > 0 && (
            <span className="px-2 py-0.5 bg-blue-900/40 border border-blue-700/40 rounded text-xs text-blue-300 font-mono">
              {report.stats.low}×LOW
            </span>
          )}
          {report.stats?.static_findings != null && report.stats.static_findings > 0 && (
            <span className="px-2 py-0.5 bg-purple-900/40 border border-purple-700/40 rounded text-xs text-purple-300 font-mono">
              {report.stats.static_findings}×STATIC
            </span>
          )}
          {(() => {
            const durationMs = report.duration_ms ?? report.stats?.duration
            return durationMs != null ? (
              <span className="px-2 py-0.5 bg-gray-900/40 border border-gray-700/40 rounded text-xs text-gray-400 font-mono ml-1">
                {(durationMs / 1000).toFixed(1)}s
              </span>
            ) : null
          })()}
          {report.scan_id && (
            <span className="text-[10px] text-gray-600 font-mono ml-auto truncate max-w-[120px]">
              {report.scan_id}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={onDownload}
            size="sm"
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-7 px-3"
          >
            <Download className="w-3 h-3 mr-1.5" />
            Download
          </Button>
          <Button
            onClick={onCopy}
            size="sm"
            variant="outline"
            className="border-purple-700/40 hover:bg-purple-900/20 text-xs h-7 px-3"
          >
            {copied
              ? <Check className="w-3 h-3 mr-1.5 text-teal-400" />
              : <Copy className="w-3 h-3 mr-1.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button
            onClick={onReset}
            size="sm"
            variant="outline"
            className="border-purple-700/40 hover:bg-purple-900/20 text-xs h-7 px-3"
          >
            <RotateCcw className="w-3 h-3 mr-1.5" />
            New Scan
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
