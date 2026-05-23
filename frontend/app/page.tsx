'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Zap, Shield, Radar, Github, ExternalLink, Download, Copy, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SeverityBadge, StatusPill } from '@/components/severity-badge'
import { ThreatRadar } from '@/components/threat-radar'
import { PhaseTimeline } from '@/components/phase-timeline'
import { FindingCard } from '@/components/finding-card'
import { AgentIdentityPassport } from '@/components/agent-identity-passport'
import { AdaptiveFollowupMoment } from '@/components/adaptive-followup-moment'
import { TrustScoreGauge } from '@/components/trust-score-gauge'
import { LiveEventRail } from '@/components/live-event-rail'
import { checkHealth, startScan, openScanStream, downloadReportJson, copyReportSummary } from '@/lib/api'
import { generateMockEvents } from '@/lib/mock-data'
import { ScanEvent, AgentCard, Finding, TestCase, Report, ScanPhase } from '@/lib/types'

const PRODUCT_NAME = 'Agent Scanner'

export default function ScannerPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'mock'>('offline')
  const [scanning, setScanning] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<ScanPhase>('waiting')
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [tests, setTests] = useState<TestCase[]>([])
  const [allEvents, setAllEvents] = useState<ScanEvent[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [showAdaptive, setShowAdaptive] = useState(false)
  const [adaptiveReason, setAdaptiveReason] = useState('')
  const [adaptiveTests, setAdaptiveTests] = useState<TestCase[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scanId, setScanId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Check backend health on mount
  useEffect(() => {
    const checkStatus = async () => {
      const isHealthy = await checkHealth()
      setBackendStatus(isHealthy ? 'online' : 'offline')
    }
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Reset UI state
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  // Dispatch individual scan events into UI state
  const handleScanEvent = useCallback((type: string, data: any) => {
    const event: ScanEvent = { ...data, type: type as any, timestamp: data.timestamp || Date.now() }
    setAllEvents((prev) => [...prev, event])

    if (type === 'scan_started') {
      setCurrentPhase('fetching')
    } else if (type === 'card_fetched') {
      setAgentCard(data.agent_card)
    } else if (type === 'phase') {
      setCurrentPhase(data.phase)
    } else if (type === 'finding') {
      setFindings((prev) => [...prev, data.finding])
    } else if (type === 'test_generated') {
      setTests((prev) => [...prev, data.test])
    } else if (type === 'test_running') {
      setTests((prev) => prev.map((t) => (t.test_id === data.test_id ? { ...t, status: 'running' as const } : t)))
    } else if (type === 'adaptive_followup') {
      setAdaptiveReason(data.reason)
      setAdaptiveTests(data.new_tests)
      setShowAdaptive(true)
      setTimeout(() => setShowAdaptive(false), 4000)
    } else if (type === 'report') {
      setReport(data.report)
      setCurrentPhase('report')
      setScanning(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    } else if (type === 'error') {
      setScanError(data.message)
      setScanning(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Start a scan — real backend or demo mock
  const handleScan = useCallback(
    async (targetUrl: string, isMock: boolean = false) => {
      // Validate URL before touching any state
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
            await new Promise((resolve) => setTimeout(resolve, 300))
            handleScanEvent(event.type, event)
          }
        } else {
          if (backendStatus === 'offline') {
            throw new Error('Backend is offline. Use "Run Demo Scan" to see a demo.')
          }

          const { scan_id, stream_url } = await startScan(targetUrl.trim())
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred'
        setScanError(message)
        setScanning(false)
      } finally {
        setLoading(false)
      }
    },
    [backendStatus, resetScan, handleScanEvent]
  )

  const handleCopySummary = async () => {
    if (report) {
      await copyReportSummary(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Radar events
  const radarEvents = findings.map((finding, idx) => ({
    id: finding.id,
    angle: (idx * 360) / Math.max(findings.length, 1),
    severity: finding.severity,
  }))

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-black opacity-40" />
        <motion.div
          className="absolute top-0 left-0 w-full h-full"
          animate={{
            background: [
              'radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-purple-700/20 bg-black/40 backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              <Shield className="w-6 h-6 text-purple-400" />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold text-white">{PRODUCT_NAME}</h1>
              <p className="text-xs text-purple-300/60">Behavioral trust scanning for AI agents</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <StatusPill status={backendStatus} />
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-purple-900/20 rounded transition-colors"
            >
              <Github className="w-5 h-5 text-gray-400 hover:text-white" />
            </a>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!scanning && !report ? (
          <>
            {/* Hero Scan Console */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-white mb-2">Trust an AI agent before you connect it</h2>
                <p className="text-lg text-gray-400">
                  Scan agent cards, permissions, skills, and live behavior before giving an agent access to your workflow.
                </p>
              </div>

              {/* URL Input */}
              <div className="bg-card/40 border border-purple-700/40 rounded-lg p-6 mb-4 max-w-2xl mx-auto">
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300 font-mono text-sm">$</span>
                    <Input
                      type="url"
                      placeholder="https://agent.example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={loading}
                      className="pl-8 bg-black/40 border-purple-700/40 text-white placeholder:text-gray-600 focus:border-purple-500/80 focus:shadow-lg focus:shadow-purple-900/20"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && url) {
                          handleScan(url)
                        }
                      }}
                    />
                  </div>
                </div>

                {scanError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
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
                    {loading ? 'Starting...' : 'Start Scan'}
                  </Button>
                  <Button
                    onClick={() => handleScan('', true)}
                    disabled={loading}
                    variant="outline"
                    className="flex-1 border-purple-700/40 hover:bg-purple-900/20"
                  >
                    Run Demo Scan
                  </Button>
                </div>
              </div>

              {/* Helper chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {['Agent Card', 'Behavioral Probes', 'Capability Mismatch', 'Adaptive Testing', 'Trust Score'].map(
                  (chip, idx) => (
                    <motion.div
                      key={chip}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="px-3 py-1 bg-purple-900/20 border border-purple-700/40 rounded-full text-xs text-purple-300"
                    >
                      {chip}
                    </motion.div>
                  )
                )}
              </div>
            </motion.section>

            {/* Scanner Modules Grid */}
            {!scanning && findings.length === 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12"
              >
                <h3 className="text-xl font-bold text-white mb-6 text-center">Scanner Modules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { title: 'Agent Card Authenticity', icon: '🛡️', desc: 'Verify card signatures and metadata' },
                    { title: 'Skill & Capability Mapping', icon: '🗺️', desc: 'Map declared vs actual capabilities' },
                    { title: 'Permission Mismatch', icon: '🔐', desc: 'Detect unauthorized access patterns' },
                    { title: 'Prompt Injection', icon: '⚡', desc: 'Test system prompt exposure' },
                    { title: 'Scope Escape', icon: '🚀', desc: 'Probe boundary violations' },
                    { title: 'Canary Exfiltration', icon: '🕊️', desc: 'Detect data exfiltration attempts' },
                  ].map((module, idx) => (
                    <motion.div
                      key={module.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ scale: 1.05 }}
                      className="border border-purple-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm hover:border-purple-700/60 transition-all cursor-default"
                    >
                      <div className="text-2xl mb-2">{module.icon}</div>
                      <h4 className="font-semibold text-white mb-1">{module.title}</h4>
                      <p className="text-xs text-gray-400 mb-3">{module.desc}</p>
                      <div className="text-xs px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded inline-block text-purple-300">
                        Ready
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </>
        ) : null}

        {/* Scan Cockpit - 3 column layout */}
        {scanning || (findings.length > 0 && !report) || report ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left column: Agent Identity */}
            <div className="order-1 lg:order-1">
              <AgentIdentityPassport agentCard={agentCard} loading={!agentCard && scanning} />
            </div>

            {/* Center column: Radar + Timeline */}
            <motion.div className="order-3 lg:order-2 space-y-6">
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="border border-purple-700/40 rounded-lg p-6 bg-card/40 backdrop-blur-sm"
              >
                <h3 className="text-sm font-mono text-purple-300/60 uppercase mb-4">Live Threat Radar</h3>
                <ThreatRadar phase={currentPhase} events={radarEvents} />
              </motion.div>

              <motion.div className="border border-purple-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm">
                <h3 className="text-sm font-mono text-purple-300/60 uppercase mb-4">Phase Timeline</h3>
                <PhaseTimeline currentPhase={currentPhase} />
              </motion.div>

              {report && <TrustScoreGauge report={report} />}
            </motion.div>

            {/* Right column: Findings Feed */}
            <div className="order-2 lg:order-3">
              <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                {findings.length > 0 ? (
                  findings.map((finding, idx) => <FindingCard key={finding.id} finding={finding} index={idx} />)
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <Radar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Waiting for findings...</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Bottom sections when scanning */}
        {(scanning || (findings.length > 0 && !report)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <LiveEventRail events={allEvents} />
            </motion.div>

            {tests.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-purple-700/40 rounded-lg p-4 bg-card/40 backdrop-blur-sm max-h-96 overflow-y-auto"
              >
                <h3 className="text-sm font-mono text-purple-300/60 uppercase mb-4">Generated Tests</h3>
                <div className="space-y-2">
                  {tests.map((test) => (
                    <motion.div key={test.test_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="p-3 bg-black/30 rounded border border-purple-700/20">
                      <div className="font-mono text-xs text-purple-300 mb-1">{test.test_type.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-gray-400">{test.what_to_watch}</div>
                      <div className="mt-2 text-xs">
                        <span className={`px-2 py-1 rounded ${test.status === 'running' ? 'bg-yellow-900/30 text-yellow-300' : 'bg-purple-900/30 text-purple-300'}`}>
                          {test.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Report actions */}
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap justify-center gap-4"
          >
            <Button
              onClick={() => downloadReportJson(report)}
              className="bg-purple-600 hover:bg-purple-500 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Report
            </Button>
            <Button
              onClick={handleCopySummary}
              variant="outline"
              className="border-purple-700/40 hover:bg-purple-900/20 flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
              Copy Summary
            </Button>
            <Button
              onClick={resetScan}
              variant="outline"
              className="border-purple-700/40 hover:bg-purple-900/20 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Scan Another Agent
            </Button>
          </motion.div>
        )}
      </main>

      {/* Adaptive Follow-up Overlay */}
      {showAdaptive && <AdaptiveFollowupMoment reason={adaptiveReason} newTests={adaptiveTests} />}
    </div>
  )
}
