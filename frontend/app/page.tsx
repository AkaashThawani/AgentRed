'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Github, AlertCircle, ChevronDown, Plus, X, KeyRound, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusPill } from '@/components/severity-badge'
import { PhaseTimeline } from '@/components/phase-timeline'
import { FindingCard } from '@/components/finding-card'
import { AgentIdentityPassport } from '@/components/agent-identity-passport'
import { AdaptiveFollowupMoment, AdaptiveInlineCard } from '@/components/adaptive-followup-moment'
import { LiveEventRail } from '@/components/live-event-rail'
import { ScanCommandBar } from '@/components/scan-command-bar'
import { ScanOverviewCard } from '@/components/scan-overview-card'
import { ReportHero } from '@/components/report-hero'
import { TestLabPanel } from '@/components/test-lab-panel'
import { PastScansPanel } from '@/components/past-scans-panel'
import { SponsorLinks } from '@/components/sponsor-links'
import { checkHealth, startScan, openScanStream, copyReportSummary } from '@/lib/api'
import { downloadReportPdf } from '@/lib/pdf'
import { generateMockEvents } from '@/lib/mock-data'
import {
  ScanEvent,
  AgentCard,
  Finding,
  TestCase,
  Report,
  ScanPhase,
  AdaptiveFollowupEvent,
} from '@/lib/types'

const PRODUCT_NAME = 'Agent Scanner'

export default function ScannerPage() {
  const [url, setUrl]                         = useState('')
  const [loading, setLoading]                 = useState(false)
  const [backendStatus, setBackendStatus]     = useState<'online' | 'offline' | 'mock'>('offline')
  const [scanning, setScanning]               = useState(false)
  const [currentPhase, setCurrentPhase]       = useState<ScanPhase>('waiting')
  const [agentCard, setAgentCard]             = useState<AgentCard | null>(null)
  const [findings, setFindings]               = useState<Finding[]>([])
  const [tests, setTests]                     = useState<TestCase[]>([])
  const [allEvents, setAllEvents]             = useState<ScanEvent[]>([])
  const [report, setReport]                   = useState<Report | null>(null)
  const [showAdaptive, setShowAdaptive]       = useState(false)
  const [adaptiveReason, setAdaptiveReason]   = useState('')
  const [adaptiveTests, setAdaptiveTests]     = useState<TestCase[]>([])
  const [scanError, setScanError]             = useState<string | null>(null)
  const [copied, setCopied]                   = useState(false)
  const [scanId, setScanId]                   = useState<string | null>(null)
  /* ── Session 4 additions ── */
  const [phaseMessage, setPhaseMessage]       = useState('')
  const [scanStartTime, setScanStartTime]     = useState<number | null>(null)
  const [authHeaders, setAuthHeaders]         = useState<Record<string, string>>({})
  const [showAuthSection, setShowAuthSection] = useState(false)
  const [headerKey, setHeaderKey]             = useState('')
  const [headerValue, setHeaderValue]         = useState('')

  const eventSourceRef = useRef<EventSource | null>(null)

  /* ---------------------------------------------------------------- */
  /* Backend health polling                                             */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const checkStatus = async () => {
      const ok = await checkHealth()
      setBackendStatus(ok ? 'online' : 'offline')
    }
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  /* ---------------------------------------------------------------- */
  /* Reset all scan state                                               */
  /* ---------------------------------------------------------------- */
  const resetScan = useCallback(() => {
    setScanning(false)
    setCurrentPhase('waiting')
    setAgentCard(null)
    setFindings([])
    setTests([])
    setAllEvents([])
    setReport(null)
    setScanError(null)
    setScanId(null)
    setShowAdaptive(false)
    setPhaseMessage('')
    setScanStartTime(null)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Auth header helpers (values never logged)                          */
  /* ---------------------------------------------------------------- */
  const addHeader = useCallback(() => {
    const k = headerKey.trim()
    if (!k || !headerValue) return
    setAuthHeaders((prev) => ({ ...prev, [k]: headerValue }))
    setHeaderKey('')
    setHeaderValue('')
  }, [headerKey, headerValue])

  const removeHeader = useCallback((key: string) => {
    setAuthHeaders((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Event dispatcher — updates state from every SSE event type        */
  /* ---------------------------------------------------------------- */
  const handleScanEvent = useCallback((type: string, data: any) => {
    const event: ScanEvent = {
      ...data,
      type: type as ScanEvent['type'],
      timestamp: data.timestamp || Date.now(),
    }
    setAllEvents((prev) => [...prev, event])

    if (type === 'scan_started') {
      setCurrentPhase('fetching')
      setScanStartTime(Date.now())
    } else if (type === 'card_fetched') {
      // Backend sends { card }, per CONTRACT.md. Accept either key just in case.
      setAgentCard(data.card ?? data.agent_card)
    } else if (type === 'phase') {
      setCurrentPhase(data.phase)
      setPhaseMessage(data.message ?? '')
    } else if (type === 'finding') {
      const f = data.finding
      setFindings((prev) => [...prev, f])
      // Mark the matching test as completed. We match by test_type + skill_targeted,
      // taking the first running test that matches (backend doesn't echo test_id on findings).
      if (f.phase === 'behavioral' && f.test_type) {
        setTests((prev) => {
          const idx = prev.findIndex(
            (t) =>
              t.status === 'running' &&
              t.test_type === f.test_type &&
              (t.skill_targeted ?? null) === (f.skill_targeted ?? null)
          )
          if (idx === -1) return prev
          const next = prev.slice()
          next[idx] = { ...next[idx], status: 'completed' as const }
          return next
        })
      }
    } else if (type === 'test_generated') {
      // Backend's TestCase uses `id` (not `test_id`) and has no `status` field.
      // Initialize it client-side so the test-lab panel can render lifecycle.
      setTests((prev) => [...prev, { ...data.test, status: 'generated' as const }])
    } else if (type === 'test_running') {
      setTests((prev) =>
        prev.map((t) =>
          (t.id ?? t.test_id) === data.test_id ? { ...t, status: 'running' as const } : t
        )
      )
    } else if (type === 'adaptive_followup') {
      setAdaptiveReason(data.reason)
      setAdaptiveTests(data.new_tests)
      setShowAdaptive(true)
      setTimeout(() => setShowAdaptive(false), 4500)
    } else if (type === 'report') {
      setReport(data.report)
      setCurrentPhase('report')
      setScanning(false)
      // Belt-and-suspenders: any tests still flagged as running/generated when the
      // scan finishes are guaranteed-done. Force them to 'completed' so the Test Lab
      // panel doesn't permanently show a phantom "N running" count.
      setTests((prev) =>
        prev.map((t) => (t.status === 'completed' ? t : { ...t, status: 'completed' as const }))
      )
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    } else if (type === 'error') {
      setScanError(data.message)
      setScanning(false)
      setScanStartTime(null)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Start scan — real backend or mock demo                             */
  /* ---------------------------------------------------------------- */
  const handleScan = useCallback(
    async (targetUrl: string, isMock = false) => {
      if (!isMock) {
        const trimmed = targetUrl.trim()
        if (!trimmed) {
          setScanError('Please enter a target URL')
          return
        }
        try {
          const parsed = new URL(trimmed)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            setScanError('URL must use http:// or https://')
            return
          }
        } catch {
          setScanError('Please enter a valid URL (e.g. https://agent.example.com)')
          return
        }
      }

      resetScan()
      setLoading(true)

      try {
        if (isMock) {
          setBackendStatus('mock')
          setScanning(true)
          for (const event of generateMockEvents()) {
            await new Promise((r) => setTimeout(r, 300))
            handleScanEvent(event.type, event)
          }
        } else {
          if (backendStatus === 'offline') {
            throw new Error('Backend is offline. Use "Run Demo Scan" to see a demo.')
          }

          // auth headers sent in body only — values never logged or shown in UI
          const { scan_id, stream_url } = await startScan(
            targetUrl.trim(),
            Object.keys(authHeaders).length > 0 ? authHeaders : undefined,
          )
          setScanId(scan_id)
          setScanning(true)

          eventSourceRef.current = openScanStream(
            stream_url,
            (type, data) => handleScanEvent(type, data as ScanEvent),
            (error) => {
              console.error('Stream error:', error)
              setScanError('Stream connection failed. Please try again.')
              setScanning(false)
            }
          )
        }
      } catch (err) {
        setScanError(err instanceof Error ? err.message : 'Unknown error occurred')
        setScanning(false)
      } finally {
        setLoading(false)
      }
    },
    [backendStatus, resetScan, handleScanEvent, authHeaders]
  )

  const handleCopySummary = async () => {
    if (report) {
      await copyReportSummary(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Derived values                                                     */
  /* ---------------------------------------------------------------- */
  const adaptiveFollowups = allEvents.filter(
    (e): e is AdaptiveFollowupEvent => e.type === 'adaptive_followup'
  )

  // Show cockpit only once scan data has started arriving
  const isInScanMode =
    scanning || agentCard !== null || findings.length > 0 || report !== null

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Background ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-black opacity-40" />
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              'radial-gradient(circle at 20% 30%, rgba(139,92,246,0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 70%, rgba(139,92,246,0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 30%, rgba(139,92,246,0.1) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-slate-700/20 bg-black/40 backdrop-blur-xl sticky top-0 z-30"
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              <Shield className="w-6 h-6 text-slate-400" />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold text-white">{PRODUCT_NAME}</h1>
              <p className="text-xs text-slate-300/60">Behavioral trust scanning for AI agents</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SponsorLinks />
            <StatusPill status={backendStatus} />
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-slate-800/20 rounded transition-colors"
            >
              <Github className="w-5 h-5 text-gray-400 hover:text-white" />
            </a>
          </div>
        </div>
      </motion.header>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* ══════════════════════════════════════════════════════════ */}
        {/* HOME PAGE                                                  */}
        {/* ══════════════════════════════════════════════════════════ */}
        {!isInScanMode && (
          <>
            {/* Hero */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-white mb-2">
                  Trust an AI agent before you connect it
                </h2>
                <p className="text-lg text-gray-400">
                  Scan agent cards, permissions, skills, and live behavior before giving an agent
                  access to your workflow.
                </p>
              </div>

              {/* URL input card */}
              <div className="bg-card/40 border border-slate-700/40 rounded-lg p-6 mb-4 max-w-2xl mx-auto">
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-mono text-sm">
                      $
                    </span>
                    <Input
                      type="url"
                      placeholder="https://agent.example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={loading}
                      className="pl-8 bg-black/40 border-slate-700/40 text-white placeholder:text-gray-600 focus:border-purple-500/80 focus:shadow-lg focus:shadow-purple-900/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && url) handleScan(url)
                      }}
                    />
                  </div>
                </div>

                {scanError && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-200 text-sm"
                  >
                    {scanError}
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={() => url && handleScan(url)}
                    disabled={loading || !url}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    {loading ? 'Starting…' : 'Start Scan'}
                  </Button>
                  <Button
                    onClick={() => handleScan('', true)}
                    disabled={loading}
                    variant="outline"
                    className="flex-1 border-slate-700/40 hover:bg-slate-800/20"
                  >
                    Run Demo Scan
                  </Button>
                </div>

                {/* ── Advanced: Auth Headers ── */}
                <div className="mt-4 border-t border-slate-700/20 pt-3">
                  <button
                    onClick={() => setShowAuthSection((v) => !v)}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-left"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400/60 flex-shrink-0" />
                    <span>Advanced: Auth Headers</span>
                    {Object.keys(authHeaders).length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-slate-800/40 border border-slate-700/40 rounded text-slate-300 font-mono text-[10px]">
                        {Object.keys(authHeaders).length}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${
                        showAuthSection ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {showAuthSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-3">
                          {/* Existing headers (values always masked) */}
                          {Object.keys(authHeaders).length > 0 && (
                            <div className="space-y-1.5">
                              {Object.keys(authHeaders).map((key) => (
                                <div
                                  key={key}
                                  className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded px-2 py-1.5"
                                >
                                  <span className="text-xs text-slate-300/70 font-mono flex-1 truncate">
                                    {key}
                                  </span>
                                  <span className="text-xs text-gray-600 font-mono tracking-widest">
                                    ••••••••
                                  </span>
                                  <button
                                    onClick={() => removeHeader(key)}
                                    className="p-0.5 hover:bg-red-900/20 rounded text-red-500/50 hover:text-red-400 transition-colors flex-shrink-0"
                                    aria-label={`Remove ${key}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add new header row */}
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              placeholder="Header name"
                              value={headerKey}
                              onChange={(e) => setHeaderKey(e.target.value)}
                              className="flex-1 h-7 text-xs bg-black/40 border-slate-700/40 text-white placeholder:text-gray-700"
                              onKeyDown={(e) => { if (e.key === 'Enter') addHeader() }}
                            />
                            <Input
                              type="password"
                              placeholder="Value"
                              value={headerValue}
                              onChange={(e) => setHeaderValue(e.target.value)}
                              className="flex-1 h-7 text-xs bg-black/40 border-slate-700/40 text-white placeholder:text-gray-700"
                              onKeyDown={(e) => { if (e.key === 'Enter') addHeader() }}
                            />
                            <Button
                              onClick={addHeader}
                              disabled={!headerKey.trim() || !headerValue}
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 border-slate-700/40 hover:bg-slate-800/20 flex-shrink-0"
                              aria-label="Add header"
                            >
                              <Plus className="w-3.5 h-3.5 text-slate-300" />
                            </Button>
                          </div>

                          <p className="text-[10px] text-gray-600 leading-relaxed">
                            Headers are sent only during this session and cleared on page refresh.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Helper chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {[
                  'Agent Card',
                  'Behavioral Probes',
                  'Capability Mismatch',
                  'Adaptive Testing',
                  'Trust Score',
                ].map((chip, idx) => (
                  <motion.div
                    key={chip}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="px-3 py-1 bg-slate-800/20 border border-slate-700/40 rounded-full text-xs text-slate-300"
                  >
                    {chip}
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Scanner modules grid */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <h3 className="text-xl font-bold text-white mb-6 text-center">Scanner Modules</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { title: 'Agent Card Authenticity',   icon: '🛡️', desc: 'Verify card signatures and metadata'    },
                  { title: 'Skill & Capability Mapping', icon: '🗺️', desc: 'Map declared vs actual capabilities'    },
                  { title: 'Permission Mismatch',        icon: '🔐', desc: 'Detect unauthorized access patterns'    },
                  { title: 'Prompt Injection',           icon: '⚡', desc: 'Test system prompt exposure'            },
                  { title: 'Scope Escape',               icon: '🚀', desc: 'Probe boundary violations'              },
                  { title: 'Canary Exfiltration',        icon: '🕊️', desc: 'Detect data exfiltration attempts'      },
                ].map((module, idx) => (
                  <motion.div
                    key={module.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.03 }}
                    className="border border-slate-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm hover:border-slate-700/60 transition-all cursor-default"
                  >
                    <div className="text-2xl mb-2">{module.icon}</div>
                    <h4 className="font-semibold text-white mb-1">{module.title}</h4>
                    <p className="text-xs text-gray-400 mb-3">{module.desc}</p>
                    <div className="text-xs px-2 py-1 bg-slate-800/30 border border-slate-700/50 rounded inline-block text-slate-300">
                      Ready
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* SCAN COCKPIT                                               */}
        {/* ══════════════════════════════════════════════════════════ */}
        {isInScanMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          >
            {/* 1 ── Scan Command Bar (with progress bar) */}
            <ScanCommandBar
              targetUrl={url}
              phase={currentPhase}
              scanning={scanning}
              backendStatus={backendStatus}
              onNewScan={resetScan}
            />

            {/* 2 ── Report Hero (shown only when complete) */}
            {report && (
              <ReportHero
                report={report}
                onDownload={() => downloadReportPdf(report)}
                onCopy={handleCopySummary}
                copied={copied}
              />
            )}

            {/* 3 ── Mid-scan error banner */}
            {scanError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 flex items-center gap-3 p-4 bg-red-950/60 border border-red-700/50 rounded-xl backdrop-blur-sm"
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-200 flex-1">{scanError}</p>
                <Button
                  onClick={resetScan}
                  size="sm"
                  variant="outline"
                  className="border-red-700/40 text-red-300 hover:bg-red-900/20 text-xs"
                >
                  New Scan
                </Button>
              </motion.div>
            )}

            {/* 4 ── 3-column cockpit grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── LEFT: Agent Identity ─────────────────────────── */}
              <div className="lg:col-span-1">
                <AgentIdentityPassport
                  agentCard={agentCard}
                  loading={!agentCard && scanning}
                />
              </div>

              {/* ── CENTER: Scan Progress ────────────────────────── */}
              <div className="lg:col-span-1 space-y-4">

                {/* Phase timeline */}
                <div className="bg-black/50 border border-slate-700/40 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-mono text-slate-400/60 uppercase tracking-widest">
                      Scan Phase
                    </span>
                    {scanning && (
                      <motion.div
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="ml-auto flex items-center gap-1.5 text-xs text-slate-300/50"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        LIVE
                      </motion.div>
                    )}
                  </div>
                  <PhaseTimeline currentPhase={currentPhase} />
                </div>

                {/* Scan overview (replaces radar) */}
                <ScanOverviewCard
                  phase={currentPhase}
                  phaseMessage={phaseMessage}
                  findings={findings}
                  tests={tests}
                  scanStartTime={scanStartTime}
                  scanning={scanning}
                />

                {/* Adaptive follow-up inline cards (one per event) */}
                {adaptiveFollowups.map((evt, idx) => (
                  <AdaptiveInlineCard
                    key={idx}
                    reason={evt.reason}
                    newTests={evt.new_tests}
                  />
                ))}

                {/* Test lab */}
                {tests.length > 0 && <TestLabPanel tests={tests} />}

                {/* Past scans for this target (powered by ClickHouse /history) */}
                <PastScansPanel targetUrl={url || null} refreshKey={report?.scan_id} />

                {/* Live event rail */}
                {allEvents.length > 0 && <LiveEventRail events={allEvents} />}
              </div>

              {/* ── RIGHT: Findings Feed ─────────────────────────── */}
              <div className="lg:col-span-1">
                <div className="sticky top-[5rem] space-y-3">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400/60 uppercase tracking-widest flex-1">
                      Threat Findings
                    </span>
                    {findings.filter((f) => f.severity === 'CRITICAL').length > 0 && (
                      <span className="px-2 py-0.5 bg-red-900/40 border border-red-700/40 rounded text-xs text-red-300 font-mono">
                        {findings.filter((f) => f.severity === 'CRITICAL').length}×CRIT
                      </span>
                    )}
                    {findings.length > 0 && (
                      <span className="px-2 py-0.5 bg-slate-800/40 border border-slate-700/40 rounded text-xs text-slate-300 font-mono">
                        {findings.length}
                      </span>
                    )}
                  </div>

                  {/* Findings list */}
                  <div className="space-y-2.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-0.5">
                    {findings.length > 0 ? (
                      findings.map((finding, idx) => (
                        <FindingCard key={finding.id} finding={finding} index={idx} />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-14 text-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                          className="mb-3 opacity-20"
                        >
                          <Crosshair className="w-10 h-10 text-slate-400" />
                        </motion.div>
                        <p className="text-sm text-gray-500">Scanning for threats…</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Findings appear here as they are detected
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>{/* /cockpit grid */}
          </motion.div>
        )}
      </main>

      {/* ── Adaptive follow-up overlay (timed "wow moment") ────────── */}
      {showAdaptive && (
        <AdaptiveFollowupMoment reason={adaptiveReason} newTests={adaptiveTests} />
      )}
    </div>
  )
}
