/**
 * AgentRed PDF Report Generator
 * Produces a clean, print-friendly, executive-quality security assessment report.
 * Dynamically imported so jsPDF never touches the server bundle.
 */
import type { Report, Finding, AgentCard, Skill } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type RGB = [number, number, number]

// Mutable state threaded through every section-drawing function
interface S {
  doc: any
  y: number
  pageW: number
  pageH: number
  mg: number        // horizontal margin (left & right)
  cW: number        // content width = pageW - 2*mg
  report: Report
}

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE — light/print-friendly
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  white:    [255, 255, 255] as RGB,
  offWhite: [249, 248, 254] as RGB,  // very light lavender for section blocks
  text:     [18,  16,  42]  as RGB,  // near-black heading text
  body:     [52,  48,  78]  as RGB,  // main body text
  muted:    [108, 103, 132] as RGB,  // labels / meta
  light:    [168, 162, 196] as RGB,  // de-emphasised / footer
  border:   [218, 214, 235] as RGB,  // card/section borders
  rule:     [232, 228, 248] as RGB,  // thin horizontal rules
  brand:    [109, 40,  217] as RGB,  // AgentRed purple
  brandBg:  [245, 240, 255] as RGB,  // very light purple — rec. blocks

  // Severity — text, card-bg, border
  critFg:  [185, 28,  28]  as RGB,  critBg:  [254, 242, 242] as RGB,  critBd:  [252, 165, 165] as RGB,
  highFg:  [154, 52,  18]  as RGB,  highBg:  [255, 247, 237] as RGB,  highBd:  [253, 186, 116] as RGB,
  medFg:   [133, 77,  14]  as RGB,  medBg:   [255, 251, 235] as RGB,  medBd:   [252, 211, 77]  as RGB,
  lowFg:   [30,  64,  175] as RGB,  lowBg:   [239, 246, 255] as RGB,  lowBd:   [147, 197, 253] as RGB,
  passFg:  [6,   95,  70]  as RGB,  passBg:  [240, 253, 250] as RGB,  passBd:  [110, 231, 183] as RGB,
}

interface SevPalette { fg: RGB; bg: RGB; bd: RGB }

function sevPalette(sev: string): SevPalette {
  switch (sev) {
    case 'CRITICAL': return { fg: C.critFg, bg: C.critBg, bd: C.critBd }
    case 'HIGH':     return { fg: C.highFg, bg: C.highBg, bd: C.highBd }
    case 'MEDIUM':   return { fg: C.medFg,  bg: C.medBg,  bd: C.medBd  }
    case 'LOW':      return { fg: C.lowFg,  bg: C.lowBg,  bd: C.lowBd  }
    default:         return { fg: C.passFg, bg: C.passBg, bd: C.passBd }
  }
}

// Grade → colour and text
const GRADE: Record<string, { verdict: string; meaning: string; sev: string }> = {
  TRUSTED: {
    verdict: 'Safe to Integrate',
    sev: 'PASSED',
    meaning:
      'No major risks were found. The agent card is valid and behavioral probes detected no unsafe actions. ' +
      'This agent may be suitable for integration, pending your own review.',
  },
  CAUTION: {
    verdict: 'Use with Caution',
    sev: 'MEDIUM',
    meaning:
      'Minor or moderate issues were identified. The agent behaved mostly as expected but has gaps in ' +
      'authentication or capability declarations. Review all findings before integrating.',
  },
  RISKY: {
    verdict: 'Risky Behaviour Detected',
    sev: 'HIGH',
    meaning:
      'Meaningful risks were detected. The agent exhibited behaviour inconsistent with its declared capabilities ' +
      'or has significant security gaps. Do not integrate without resolving the identified issues.',
  },
  DANGEROUS: {
    verdict: 'Do Not Trust This Agent',
    sev: 'CRITICAL',
    meaning:
      'Critical behaviour or unsafe configuration was detected. The agent may exfiltrate data, ignore security ' +
      'boundaries, or behave deceptively. Do not integrate this agent.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function tc(doc: any, c: RGB) { doc.setTextColor(c[0], c[1], c[2]) }
function fc(doc: any, c: RGB) { doc.setFillColor(c[0], c[1], c[2]) }
function dc(doc: any, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]) }

function frect(doc: any, x: number, y: number, w: number, h: number, fill: RGB) {
  fc(doc, fill)
  doc.rect(x, y, w, h, 'F')
}

function srect(doc: any, x: number, y: number, w: number, h: number, fill: RGB, border: RGB, lw = 0.25) {
  fc(doc, fill); dc(doc, border)
  doc.setLineWidth(lw)
  doc.rect(x, y, w, h, 'FD')
}

function hline(doc: any, y: number, x: number, w: number, c: RGB = C.rule) {
  dc(doc, c); doc.setLineWidth(0.2); doc.line(x, y, x + w, y)
}

function fmt_dur(ms?: number): string {
  if (!ms) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function fmt_date(ts?: string): string {
  const d = ts ? new Date(ts) : new Date()
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function short_id(id?: string): string {
  if (!id) return '—'
  return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id
}

function first_sent(text: string, max = 140): string {
  const dot = text.indexOf('. ')
  const s   = dot > 10 ? text.slice(0, dot + 1) : text
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function trunc(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 14) + ' … [truncated]' : text
}

/** Split findings into failed (vulnerabilities) and passed (informational). */
function split_findings(findings: Finding[]): { failed: Finding[]; passed: Finding[] } {
  return {
    failed: findings.filter(f => !f.passed),
    passed: findings.filter(f =>  f.passed),
  }
}

function sort_by_risk(fs: Finding[]): Finding[] {
  const ord: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return [...fs].sort((a, b) => (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4))
}

/** Derive prioritised action list from report context. */
function next_actions(report: Report): string[] {
  const out: string[] = []
  const failed = report.findings?.filter(f => !f.passed) ?? []
  const card   = report.card

  if (failed.some(f => f.severity === 'CRITICAL'))
    out.push('Immediately investigate and remediate all CRITICAL findings before any deployment.')
  if (failed.some(f => f.severity === 'HIGH'))
    out.push('Resolve HIGH severity issues; do not integrate this agent until addressed.')
  if (!card?.authentication_schemes?.length)
    out.push('Implement and enforce authentication on all agent endpoints.')
  if (!card?.signature)
    out.push('Request the agent provider to cryptographically sign the agent card to verify authenticity.')
  if (failed.some(f => /prompt|injection|leakage|disclosure/i.test(f.test_type + ' ' + f.title)))
    out.push('Deploy input sanitisation and output filtering to prevent system-prompt leakage.')
  if (failed.some(f => /exfil|canary/i.test(f.test_type + ' ' + f.title)))
    out.push('Audit and restrict outbound network access; investigate potential data exfiltration channels.')
  if (!out.some(a => /medium|low/i.test(a)) && failed.some(f => ['MEDIUM','LOW'].includes(f.severity)))
    out.push('Review and resolve remaining MEDIUM/LOW findings to further harden the integration.')
  out.push('Re-run the AgentRed scan after remediation to verify all issues have been resolved.')

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWING PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw a severity badge. Returns the badge width (so caller can advance x).
 * `top` is the top-edge y of the badge box.
 */
function badge(doc: any, sev: string, x: number, top: number): number {
  const p = sevPalette(sev)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  const tw = doc.getTextWidth(sev)
  const bw = tw + 5
  srect(doc, x, top, bw, 5, p.bg, p.bd, 0.2)
  tc(doc, p.fg)
  doc.text(sev, x + 2.5, top + 3.8)
  return bw + 3
}

/**
 * Ensure there is `needed` mm of vertical space left on the current page.
 * If not, adds a new page and draws the continuation header.
 */
function need(s: S, needed: number) {
  const FOOTER_RESERVE = 18
  if (s.y + needed > s.pageH - s.mg - FOOTER_RESERVE) {
    s.doc.addPage()
    frect(s.doc, 0, 0, s.pageW, s.pageH, C.white)
    s.y = cont_header(s)
  }
}

/** Small repeating header on continuation pages. Returns new y. */
function cont_header(s: S): number {
  const { doc, mg, cW, pageW, report } = s
  frect(doc, 0, 0, pageW, 2, C.brand)     // top brand stripe
  frect(doc, 0, 2, pageW, 13, C.white)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  tc(doc, C.brand)
  doc.text('AgentRed', mg, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text(`  ·  ${report.agent_name ?? ''}`, mg + 18, 11)

  doc.setFontSize(7)
  tc(doc, C.light)
  doc.text(`Scan ${short_id(report.scan_id)}`, pageW - mg, 11, { align: 'right' })

  hline(doc, 14, mg, cW, C.border)
  return 20
}

/** Footer drawn on every page after all content is written. */
function footers(s: S) {
  const { doc, pageW, pageH, mg, cW } = s
  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    hline(doc, pageH - 14, mg, cW, C.border)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    tc(doc, C.light)
    doc.text('Generated by AgentRed — Behavioral Trust Scanner for AI Agents', mg, pageH - 8)
    doc.text(`Page ${p} of ${n}`, pageW - mg, pageH - 8, { align: 'right' })
  }
}

/** Section heading with left brand accent bar. */
function section_title(s: S, title: string, gap = 6) {
  frect(s.doc, s.mg, s.y, 3, 6, C.brand)
  s.doc.setFont('helvetica', 'bold')
  s.doc.setFontSize(10)
  tc(s.doc, C.text)
  s.doc.text(title, s.mg + 6, s.y + 4.5)
  s.y += 6 + gap
}

/** Compact label → value row (used in identity table). */
function id_row(s: S, label: string, value: string, LW: number) {
  if (!value || value === '—') return
  const lines = s.doc.splitTextToSize(value, s.cW - LW - 2) as string[]
  const rowH  = lines.length * 4.3 + 5
  need(s, rowH)
  s.doc.setFont('helvetica', 'bold')
  s.doc.setFontSize(7.5)
  tc(s.doc, C.muted)
  s.doc.text(label, s.mg, s.y + 4)
  s.doc.setFont('helvetica', 'normal')
  s.doc.setFontSize(8)
  tc(s.doc, C.body)
  lines.forEach((l: string, i: number) => s.doc.text(l, s.mg + LW, s.y + 4 + i * 4.3))
  hline(s.doc, s.y + rowH, s.mg, s.cW, C.rule)
  s.y += rowH + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1 — EXECUTIVE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function draw_header(s: S) {
  const { doc, mg, cW, pageW, report } = s

  // 2 mm top brand stripe
  frect(doc, 0, 0, pageW, 2, C.brand)
  s.y = 10

  // Product name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  tc(doc, C.brand)
  doc.text('AgentRed', mg, s.y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  tc(doc, C.muted)
  doc.text('Behavioral Trust Scan Report', mg + 41, s.y + 7)

  // Date (top-right)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text(fmt_date(report.ts), pageW - mg, s.y + 5, { align: 'right' })
  doc.setFontSize(7)
  tc(doc, C.light)
  doc.text(`Scan ID: ${short_id(report.scan_id)}`, pageW - mg, s.y + 10, { align: 'right' })

  s.y += 15
  hline(doc, s.y, mg, cW, C.brand)
  s.y += 4

  // Target / Agent row
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text('TARGET', mg, s.y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  tc(doc, C.body)
  doc.text(report.target_url, mg + 18, s.y + 4.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text('AGENT', mg + 105, s.y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  tc(doc, C.body)
  doc.text(report.agent_name ?? '—', mg + 121, s.y + 4.5)

  s.y += 10
  hline(doc, s.y, mg, cW)
  s.y += 8
}

function draw_verdict(s: S) {
  const { doc, mg, cW, report } = s
  const info = GRADE[report.grade] ?? GRADE.CAUTION
  const p    = sevPalette(info.sev)

  need(s, 34)

  // Verdict card — very light section bg with grade-coloured left bar
  srect(doc, mg, s.y, cW, 30, C.offWhite, C.border, 0.3)
  frect(doc, mg, s.y, 4, 30, p.fg)   // thick left accent bar

  // Trust score
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(34)
  tc(doc, p.fg)
  doc.text(`${report.trust_score}`, mg + 9, s.y + 21)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  tc(doc, C.muted)
  // Offset "/100" based on digit count
  const scoreW = report.trust_score >= 100 ? 23 : report.trust_score >= 10 ? 16 : 9
  doc.text('/100', mg + 9 + scoreW, s.y + 21)

  // Vertical divider
  dc(doc, C.border); doc.setLineWidth(0.2)
  doc.line(mg + 50, s.y + 4, mg + 50, s.y + 26)

  // Grade badge
  const bw = badge(doc, report.grade, mg + 56, s.y + 5)

  // Verdict text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  tc(doc, p.fg)
  doc.text(info.verdict, mg + 56 + bw, s.y + 10)

  // Score explanation (italic, muted)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text('This score combines static agent-card checks and live behavioral probe results.', mg + 56, s.y + 20)

  s.y += 36
}

function draw_executive_summary(s: S) {
  const { doc, mg, cW, report } = s
  const info = GRADE[report.grade] ?? GRADE.CAUTION

  need(s, 14)
  section_title(s, 'Executive Summary')

  if (report.summary) {
    const lines = doc.splitTextToSize(report.summary, cW) as string[]
    need(s, lines.length * 4.5 + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    tc(doc, C.body)
    lines.forEach((l: string, i: number) => doc.text(l, mg, s.y + i * 4.5))
    s.y += lines.length * 4.5 + 6
  }

  // "What this means" inline label + paragraph
  const label = 'What this means:  '
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  tc(doc, C.brand)
  const lw = doc.getTextWidth(label)

  const mLines = doc.splitTextToSize(info.meaning, cW - lw) as string[]
  need(s, mLines.length * 4.5 + 4)

  doc.text(label, mg, s.y)
  doc.setFont('helvetica', 'normal')
  tc(doc, C.body)
  // First line shares the row with the label
  doc.text(mLines[0], mg + lw, s.y)
  for (let i = 1; i < mLines.length; i++) doc.text(mLines[i], mg, s.y + i * 4.5)
  s.y += mLines.length * 4.5 + 6

  hline(doc, s.y, mg, cW)
  s.y += 6
}

function draw_key_risk_summary(s: S) {
  const { doc, mg, cW, report } = s
  const st = report.stats
  if (!st) return

  need(s, 14)
  section_title(s, 'Key Risk Summary')

  const metrics: { label: string; value: string; fg: RGB; bg: RGB; bd: RGB }[] = [
    { label: 'Critical',     value: String(st.critical),                          fg: C.critFg, bg: C.critBg, bd: C.critBd },
    { label: 'High',         value: String(st.high),                              fg: C.highFg, bg: C.highBg, bd: C.highBd },
    { label: 'Medium',       value: String(st.medium),                            fg: C.medFg,  bg: C.medBg,  bd: C.medBd  },
    { label: 'Low',          value: String(st.low),                               fg: C.lowFg,  bg: C.lowBg,  bd: C.lowBd  },
    { label: 'Static Checks',value: String(st.static_findings ?? 0),              fg: C.muted,  bg: C.offWhite, bd: C.border },
    { label: 'Conformance',  value: String(st.conformance_findings ?? 0),         fg: C.muted,  bg: C.offWhite, bd: C.border },
    { label: 'Total Tests',  value: String(st.total_tests),                       fg: C.brand,  bg: C.brandBg, bd: C.border },
    { label: 'Passed',       value: String(st.passed),                            fg: C.passFg, bg: C.passBg, bd: C.passBd },
    { label: 'Failed',       value: String(st.failed),                            fg: C.critFg, bg: C.critBg, bd: C.critBd },
    { label: 'Duration',     value: fmt_dur(report.duration_ms),                  fg: C.muted,  bg: C.offWhite, bd: C.border },
  ]

  const CELL_H = 17
  const cellW  = cW / metrics.length

  need(s, CELL_H + 4)
  metrics.forEach((m, i) => {
    const cx = mg + i * cellW
    srect(doc, cx, s.y, cellW - 0.5, CELL_H, m.bg, m.bd, 0.2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    tc(doc, m.fg)
    doc.text(m.value, cx + (cellW - 0.5) / 2, s.y + 9, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    tc(doc, C.muted)
    doc.text(m.label, cx + (cellW - 0.5) / 2, s.y + 14.5, { align: 'center' })
  })

  s.y += CELL_H + 8
  hline(doc, s.y, mg, cW)
  s.y += 6
}

function draw_top_findings(s: S, top3: Finding[]) {
  if (!top3.length) return
  const { doc, mg, cW } = s

  need(s, 14)
  section_title(s, `Top Findings  (${top3.length} highest-risk shown — see Detailed Findings for full list)`, 4)

  for (const f of top3) {
    const p = sevPalette(f.severity)

    const impLines = doc.splitTextToSize(first_sent(f.description), cW - 8) as string[]
    const recLines = f.recommendation
      ? doc.splitTextToSize(trunc(f.recommendation, 180), cW - 8) as string[]
      : []

    const cardH = 6 + 6 + 5 + impLines.length * 4.3 + (recLines.length ? recLines.length * 4.3 + 6 : 0) + 6
    need(s, cardH + 4)

    // Card: white fill, colored left bar, thin border
    srect(doc, mg, s.y, cW, cardH, C.white, C.border, 0.3)
    frect(doc, mg, s.y, 3, cardH, p.fg)

    let ly = s.y + 5.5

    // Severity badge + title (same line)
    const bw = badge(doc, f.severity, mg + 5, ly - 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    tc(doc, C.text)
    doc.text(f.title, mg + 5 + bw, ly)
    ly += 5.5

    // Meta: phase · test_type · skill
    const meta = [f.phase, f.test_type?.replace(/_/g, ' '), f.skill_targeted].filter(Boolean).join('  ·  ')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    tc(doc, C.muted)
    doc.text(meta, mg + 5, ly)
    ly += 5

    // Impact (first sentence)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    tc(doc, C.body)
    impLines.forEach((l: string, i: number) => doc.text(l, mg + 5, ly + i * 4.3))
    ly += impLines.length * 4.3 + 2

    // Recommendation (concise)
    if (recLines.length) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      tc(doc, C.brand)
      const fixLabel = 'Fix: '
      const fixW     = doc.getTextWidth(fixLabel)
      doc.text(fixLabel, mg + 5, ly)
      doc.setFont('helvetica', 'normal')
      tc(doc, C.body)
      recLines.forEach((l: string, i: number) =>
        doc.text(l, i === 0 ? mg + 5 + fixW : mg + 5, ly + i * 4.3)
      )
    }

    s.y += cardH + 4
  }

  hline(doc, s.y, mg, cW)
  s.y += 6
}

function draw_next_actions(s: S) {
  const { doc, mg, cW, report } = s
  const actions = next_actions(report)
  if (!actions.length) return

  need(s, 14)
  section_title(s, 'Recommended Next Actions')

  actions.forEach((action, idx) => {
    const lines = doc.splitTextToSize(action, cW - 10) as string[]
    need(s, lines.length * 4.5 + 4)

    // Numbered bullet
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    tc(doc, C.brand)
    doc.text(`${idx + 1}.`, mg, s.y + 4.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    tc(doc, C.body)
    lines.forEach((l: string, i: number) => doc.text(l, mg + 7, s.y + 4.5 + i * 4.5))
    s.y += lines.length * 4.5 + 4
  })

  s.y += 4
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2+ — DETAILED REPORT
// ─────────────────────────────────────────────────────────────────────────────

function draw_agent_identity(s: S) {
  const { doc, mg, cW, report } = s
  // Backend sends the raw A2A card under `report.card`. Older code paths use a normalised
  // flat shape (agent_name / endpoint_url / etc.). Read both so the section is populated
  // regardless of which shape the report contains.
  const c: any = report.card ?? {}
  if (!c || Object.keys(c).length === 0) return

  const name      = c.agent_name ?? c.name ?? report.agent_name
  const desc      = c.description
  const endpoint  = c.endpoint_url ?? c.url ?? c.interfaces?.find?.((i: any) => i?.type === 'json-rpc')?.url
  const provOrg   = c.provider_organization ?? c.provider?.organization
  const provUrl   = c.provider_url ?? c.provider?.url
  const version   = c.version
  const authList: string[] = c.authentication_schemes ?? c.authentication?.schemes ?? []
  const signed    = Boolean(c.signature ?? c.agentCardSignature)
  const skills    = c.skills ?? []

  need(s, 14)
  section_title(s, 'Agent Identity')

  const LW = 38  // label column width
  id_row(s, 'Name',           name ?? '—',                                                LW)
  id_row(s, 'Description',    desc ?? '—',                                                LW)
  id_row(s, 'Endpoint',       endpoint ?? '—',                                            LW)
  id_row(s, 'Provider',       provOrg ?? '—',                                             LW)
  id_row(s, 'Provider URL',   provUrl ?? '—',                                             LW)
  id_row(s, 'Version',        version ?? '—',                                             LW)
  id_row(s, 'Authentication', authList.length ? authList.join(', ') : 'None declared',    LW)
  id_row(s, 'Card Signature', signed ? 'Present — card is signed' : 'Absent — card is unsigned and cannot be verified', LW)

  // Capabilities
  if (c.capabilities && typeof c.capabilities === 'object') {
    const caps = (Object.entries(c.capabilities) as [string, boolean | undefined][])
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim())
    if (caps.length) id_row(s, 'Capabilities', caps.join(', '), LW)
  }

  // Skills
  if (Array.isArray(skills) && skills.length) {
    const skillNames = skills.map((sk: any) => sk?.name).filter(Boolean).join(', ')
    if (skillNames) id_row(s, 'Skills', skillNames, LW)
  }

  hline(doc, s.y, mg, cW)
  s.y += 8
}

function draw_detailed_finding(s: S, f: Finding) {
  const { doc, mg, cW } = s
  const p = sevPalette(f.severity)

  const ev       = (f.evidence ?? {}) as any
  // Backend uses `highlight`; older paths used `smoking_gun`. Accept both.
  const evKey    = trunc(ev.highlight ?? ev.smoking_gun ?? '',  300)
  const evReq    = trunc(ev.request                     ?? '',  300)
  const evRes    = trunc(ev.response                    ?? '',  300)

  // Pre-calculate all line counts to estimate card height (generous buffers)
  const titleLines = doc.splitTextToSize(f.title,              cW - 12) as string[]
  const descLines  = doc.splitTextToSize(f.description,        cW - 12) as string[]
  const recLines   = f.recommendation
    ? doc.splitTextToSize(f.recommendation, cW - 14) as string[]
    : []
  const evKeyLines = evKey ? doc.splitTextToSize(evKey, cW - 18) as string[] : []
  const evReqLines = evReq ? doc.splitTextToSize(evReq, cW - 18) as string[] : []
  const evResLines = evRes ? doc.splitTextToSize(evRes, cW - 18) as string[] : []

  // Height: header + title + desc + evidence sections + rec + padding
  let cardH = 8 + titleLines.length * 5.2 + 5 + descLines.length * 4.5 + 6
  if (evKey) cardH += evKeyLines.length * 3.8 + 12
  if (evReq) cardH += evReqLines.length * 3.8 + 12
  if (evRes) cardH += evResLines.length * 3.8 + 12
  if (recLines.length) cardH += recLines.length * 4.5 + 12
  cardH += 6  // bottom padding

  need(s, cardH)

  // Card shell: white bg + light border + thick left severity bar
  srect(doc, mg, s.y, cW, cardH, C.white, C.border, 0.3)
  frect(doc, mg, s.y, 4,      cardH, p.fg)

  let ly = s.y + 7

  // ── Badge + meta (same row) ──────────────────────────────────────
  const bw = badge(doc, f.severity, mg + 6, ly - 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  tc(doc, C.muted)
  const metaParts = [f.phase, f.test_type?.replace(/_/g, ' ')].filter(Boolean)
  if (f.owasp_llm?.id) metaParts.push(`OWASP ${f.owasp_llm.id}`)
  doc.text(metaParts.join('  ·  '), mg + 6 + bw, ly - 0.5)
  if (f.skill_targeted) {
    tc(doc, C.brand)
    doc.text(`Skill: ${f.skill_targeted}`, mg + cW - 6, ly - 0.5, { align: 'right' })
  }
  ly += 6

  // ── Title ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  tc(doc, C.text)
  titleLines.forEach((l: string, i: number) => doc.text(l, mg + 6, ly + i * 5.2))
  ly += titleLines.length * 5.2 + 5

  // ── Description ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  tc(doc, C.body)
  descLines.forEach((l: string, i: number) => doc.text(l, mg + 6, ly + i * 4.5))
  ly += descLines.length * 4.5 + 5

  // ── Key Evidence ──────────────────────────────────────────────────
  if (evKey) {
    frect(doc, mg + 6, ly, cW - 9, evKeyLines.length * 3.8 + 10, p.bg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    tc(doc, p.fg)
    doc.text('Key Evidence', mg + 9, ly + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    tc(doc, C.body)
    evKeyLines.forEach((l: string, i: number) => doc.text(l, mg + 9, ly + 10 + i * 3.8))
    ly += evKeyLines.length * 3.8 + 14
  }

  // ── Request ───────────────────────────────────────────────────────
  if (evReq) {
    frect(doc, mg + 6, ly, cW - 9, evReqLines.length * 3.8 + 10, C.offWhite)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    tc(doc, C.muted)
    doc.text('Request', mg + 9, ly + 5)
    doc.setFont('courier', 'normal')
    doc.setFontSize(6.5)
    tc(doc, C.body)
    evReqLines.forEach((l: string, i: number) => doc.text(l, mg + 9, ly + 10 + i * 3.8))
    ly += evReqLines.length * 3.8 + 14
  }

  // ── Response ──────────────────────────────────────────────────────
  if (evRes) {
    frect(doc, mg + 6, ly, cW - 9, evResLines.length * 3.8 + 10, C.offWhite)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    tc(doc, C.muted)
    doc.text('Response', mg + 9, ly + 5)
    doc.setFont('courier', 'normal')
    doc.setFontSize(6.5)
    tc(doc, C.body)
    evResLines.forEach((l: string, i: number) => doc.text(l, mg + 9, ly + 10 + i * 3.8))
    ly += evResLines.length * 3.8 + 14
  }

  // ── Recommendation ────────────────────────────────────────────────
  if (recLines.length) {
    frect(doc, mg + 6, ly, cW - 9, recLines.length * 4.5 + 12, C.brandBg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    tc(doc, C.brand)
    doc.text('Recommendation', mg + 9, ly + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    tc(doc, C.body)
    recLines.forEach((l: string, i: number) => doc.text(l, mg + 9, ly + 12 + i * 4.5))
  }

  s.y += cardH + 5
}

function draw_passed_checks(s: S, passed: Finding[]) {
  if (!passed.length) return
  const { doc, mg, cW } = s

  need(s, 14)
  section_title(s, 'Passed / Informational Checks')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  doc.text(
    'The following checks completed successfully and did not identify security issues.',
    mg, s.y
  )
  s.y += 7

  for (const f of passed) {
    const descLines = doc.splitTextToSize(first_sent(f.description, 180), cW - 45) as string[]
    const rowH      = Math.max(9, descLines.length * 3.9 + 6)
    need(s, rowH + 2)

    // Subtle teal-accented row
    srect(doc, mg, s.y, cW, rowH, C.passBg, C.passBd, 0.15)
    frect(doc, mg, s.y, 2.5, rowH, C.passFg)

    // Check mark
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    tc(doc, C.passFg)
    doc.text('✓', mg + 5, s.y + rowH / 2 + 2)

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    tc(doc, C.passFg)
    doc.text(f.title, mg + 12, s.y + 4.5)

    // Description (first sentence, muted)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    tc(doc, C.muted)
    descLines.forEach((l: string, i: number) => doc.text(l, mg + 12, s.y + 8.5 + i * 3.9))

    // PASSED badge on right
    badge(doc, 'PASSED', mg + cW - 23, s.y + (rowH - 5) / 2)

    s.y += rowH + 2
  }

  s.y += 4
}

function draw_appendix(s: S) {
  const { doc, mg, cW, report } = s

  need(s, 20)
  hline(doc, s.y, mg, cW, C.border)
  s.y += 6

  section_title(s, 'Appendix — Scan Metadata')

  const rows: [string, string][] = [
    ['Full Scan ID',   report.scan_id ?? '—'],
    ['Target URL',     report.target_url],
    ['Agent Name',     report.agent_name ?? '—'],
    ['Grade',          report.grade],
    ['Trust Score',    `${report.trust_score}/100`],
    ['Duration',       fmt_dur(report.duration_ms)],
    ['Scan Date',      fmt_date(report.ts)],
    ['Report Time',    new Date().toISOString()],
  ]

  const LW = 42
  for (const [label, value] of rows) {
    need(s, 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    tc(doc, C.muted)
    doc.text(label, mg, s.y + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    tc(doc, C.body)
    doc.text(value, mg + LW, s.y + 4)
    hline(doc, s.y + 7, mg, cW, C.rule)
    s.y += 8
  }

  s.y += 5
  const disclaimer =
    'This report was automatically generated by AgentRed and reflects the state of the scanned agent ' +
    'at the time of the scan. It should be used as input to a broader security assessment, ' +
    'not as a definitive certification.'
  const dLines = doc.splitTextToSize(disclaimer, cW) as string[]
  need(s, dLines.length * 4.2 + 2)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  tc(doc, C.muted)
  dLines.forEach((l: string, i: number) => doc.text(l, mg, s.y + i * 4.2))
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/** Generate and save an AgentRed PDF report. Client-side only (dynamic import). */
export async function downloadReportPdf(report: Report): Promise<void> {
  const { jsPDF } = await import('jspdf')

  const PAGE_W = 210, PAGE_H = 297, MG = 20
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // White background on page 1
  frect(doc, 0, 0, PAGE_W, PAGE_H, C.white)

  const s: S = { doc, y: 0, pageW: PAGE_W, pageH: PAGE_H, mg: MG, cW: PAGE_W - MG * 2, report }

  const allFindings          = report.findings ?? []
  const { failed, passed }   = split_findings(allFindings)
  const top3                 = sort_by_risk(failed).slice(0, 3)
  const SEV_ORDER            = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

  // ── PAGE 1 — Executive Summary ────────────────────────────────────
  draw_header(s)
  draw_verdict(s)
  draw_executive_summary(s)
  draw_key_risk_summary(s)
  draw_top_findings(s, top3)
  draw_next_actions(s)

  // ── PAGE 2+ — Detailed Report ─────────────────────────────────────
  doc.addPage()
  frect(doc, 0, 0, PAGE_W, PAGE_H, C.white)
  s.y = cont_header(s)

  draw_agent_identity(s)

  // Detailed findings grouped by severity
  need(s, 14)
  section_title(s, 'Detailed Findings', 8)

  let hasAny = false
  for (const sev of SEV_ORDER) {
    const group = failed.filter(f => f.severity === sev)
    if (!group.length) continue
    hasAny = true

    // Severity group header
    need(s, 13)
    const p = sevPalette(sev)
    frect(doc, s.mg, s.y, s.cW, 8, p.bg)
    hline(doc, s.y, s.mg, s.cW, p.bd)
    hline(doc, s.y + 8, s.mg, s.cW, p.bd)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    tc(doc, p.fg)
    doc.text(`${sev}  —  ${group.length} ${group.length === 1 ? 'finding' : 'findings'}`, s.mg + 4, s.y + 5.5)
    s.y += 12

    for (const f of group) {
      draw_detailed_finding(s, f)
    }
  }

  if (!hasAny) {
    need(s, 12)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    tc(doc, C.passFg)
    doc.text('No failed findings — all checks passed.', s.mg, s.y + 5)
    s.y += 12
  }

  draw_passed_checks(s, passed)
  draw_appendix(s)

  // Draw footers on every page after all content is laid out
  footers(s)

  // ── Save ──────────────────────────────────────────────────────────
  const date      = new Date().toISOString().split('T')[0]
  const agentSlug = (report.agent_name ?? report.scan_id ?? 'report')
    .replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 28)
  doc.save(`agentred-report-${agentSlug}-${date}.pdf`)
}
