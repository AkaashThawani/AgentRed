import type { Report, Finding } from './types'

type RGB = [number, number, number]

const GRADE_COLOR: Record<string, RGB> = {
  TRUSTED:   [13,  148, 136],
  CAUTION:   [217, 119, 6],
  RISKY:     [234, 88,  12],
  DANGEROUS: [220, 38,  38],
}

const GRADE_TAGLINE: Record<string, string> = {
  TRUSTED:   'Safe to integrate into your workflow',
  CAUTION:   'Proceed with caution — review all findings before use',
  RISKY:     'Risky behaviour detected — not recommended for production',
  DANGEROUS: 'Do not trust this agent — immediate review required',
}

const SEV_COLOR: Record<string, RGB> = {
  CRITICAL: [220, 38,  38],
  HIGH:     [234, 88,  12],
  MEDIUM:   [217, 119, 6],
  LOW:      [37,  99,  235],
  PASSED:   [13,  148, 136],
}

function dim(c: RGB, factor = 0.35): RGB {
  return [Math.round(c[0] * factor), Math.round(c[1] * factor), Math.round(c[2] * factor)]
}

/** Generate and download an AgentRed report as a styled PDF (client-side only via jsPDF). */
export async function downloadReportPdf(report: Report): Promise<void> {
  // Dynamic import keeps jsPDF out of the server bundle entirely
  const { jsPDF } = await import('jspdf')

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const mg    = 18                   // margin
  const cW    = pageW - mg * 2       // content width
  let   y     = 0

  const gradeColor = GRADE_COLOR[report.grade] ?? ([100, 100, 100] as RGB)

  /* ── helper: add a new page and reset y when we're too close to the bottom ── */
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - mg - 12) {    // 12 reserved for footer
      doc.addPage()
      y = mg
    }
  }

  /* ── helper: wrap + print multi-line text, returns new y ── */
  const printWrapped = (
    text: string,
    x: number,
    startY: number,
    maxW: number,
    lineH: number
  ): number => {
    const lines = doc.splitTextToSize(text, maxW) as string[]
    lines.forEach((line, i) => doc.text(line, x, startY + i * lineH))
    return startY + lines.length * lineH
  }

  /* ================================================================ */
  /* HEADER BAND                                                        */
  /* ================================================================ */
  doc.setFillColor(10, 4, 22)
  doc.rect(0, 0, pageW, 38, 'F')

  // Left accent strip
  doc.setFillColor(gradeColor[0], gradeColor[1], gradeColor[2])
  doc.rect(0, 0, 5, 38, 'F')

  // Product name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(200, 170, 255)
  doc.text('AgentRed', mg, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 160)
  doc.text('Behavioral Trust Scan Report', mg, 20)

  // Target URL
  const urlDisplay =
    report.target_url.length > 72
      ? report.target_url.slice(0, 69) + '…'
      : report.target_url
  doc.setFontSize(8)
  doc.setTextColor(180, 150, 255)
  doc.text(urlDisplay, mg, 29)

  // Right: date + scan ID
  const dateStr = report.ts
    ? new Date(report.ts).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
  doc.setFontSize(7)
  doc.setTextColor(90, 90, 110)
  doc.text(dateStr, pageW - mg, 14, { align: 'right' })
  if (report.scan_id) {
    const shortId = report.scan_id.length > 26
      ? report.scan_id.slice(0, 23) + '…'
      : report.scan_id
    doc.text(`ID: ${shortId}`, pageW - mg, 21, { align: 'right' })
  }

  y = 46

  /* ================================================================ */
  /* TRUST SCORE + GRADE                                                */
  /* ================================================================ */
  // Colored left bar
  doc.setFillColor(gradeColor[0], gradeColor[1], gradeColor[2])
  doc.rect(mg, y, 3, 30, 'F')

  // Score number
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(38)
  doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2])
  doc.text(`${report.trust_score}`, mg + 8, y + 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 120)
  doc.text('/100', mg + 8 + (report.trust_score === 100 ? 26 : 18), y + 22)

  // Grade badge
  const badgeDim = dim(gradeColor, 0.25)
  doc.setFillColor(badgeDim[0], badgeDim[1], badgeDim[2])
  doc.roundedRect(mg + 50, y + 4, 30, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2])
  doc.text(report.grade, mg + 50 + 15, y + 10.8, { align: 'center' })

  // Tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(150, 150, 170)
  doc.text(GRADE_TAGLINE[report.grade] ?? '', mg + 50, y + 22)

  y += 38

  /* ================================================================ */
  /* SUMMARY                                                            */
  /* ================================================================ */
  if (report.summary) {
    const summaryLines = doc.splitTextToSize(report.summary, cW - 8) as string[]
    const boxH = summaryLines.length * 4.8 + 12

    doc.setFillColor(18, 8, 36)
    doc.roundedRect(mg, y, cW, boxH, 2, 2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(139, 92, 246)
    doc.text('SUMMARY', mg + 5, y + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(190, 190, 210)
    summaryLines.forEach((line, i) => doc.text(line, mg + 5, y + 13 + i * 4.8))

    y += boxH + 8
  }

  /* ================================================================ */
  /* STATS ROW                                                          */
  /* ================================================================ */
  if (report.stats) {
    const s   = report.stats
    const dur = report.duration_ms ?? s.duration

    const cells: { label: string; value: string; color: RGB }[] = [
      { label: 'Total Tests', value: String(s.total_tests),                                     color: [139, 92, 246] },
      { label: 'Passed',      value: String(s.passed),                                          color: [13, 148, 136] },
      { label: 'Failed',      value: String(s.failed),                                          color: [220, 38, 38]  },
      { label: 'Critical',    value: String(s.critical),                                        color: [220, 38, 38]  },
      { label: 'High',        value: String(s.high),                                            color: [234, 88, 12]  },
      { label: 'Medium',      value: String(s.medium),                                          color: [217, 119, 6]  },
      { label: 'Low',         value: String(s.low),                                             color: [37, 99, 235]  },
      { label: 'Duration',    value: dur != null ? `${(dur / 1000).toFixed(1)}s` : '—',         color: [100, 100, 130] },
    ]
    if (s.static_findings != null) {
      cells.splice(3, 0, { label: 'Static',  value: String(s.static_findings), color: [139, 92, 246] })
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(139, 92, 246)
    doc.text('STATISTICS', mg, y)
    y += 5

    const cellW  = cW / cells.length
    const cellH  = 17

    cells.forEach((cell, i) => {
      const cx = mg + i * cellW
      doc.setFillColor(18, 8, 36)
      doc.rect(cx, y, cellW - 1, cellH, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(cell.color[0], cell.color[1], cell.color[2])
      doc.text(cell.value, cx + (cellW - 1) / 2, y + 8, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(110, 110, 130)
      doc.text(cell.label, cx + (cellW - 1) / 2, y + 14, { align: 'center' })
    })

    y += cellH + 10
  }

  /* ================================================================ */
  /* FINDINGS                                                           */
  /* ================================================================ */
  if (report.findings && report.findings.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(139, 92, 246)
    doc.text(`FINDINGS  (${report.findings.length})`, mg, y)
    y += 6

    for (const finding of report.findings) {
      const sev      = finding.severity
      const sevColor = SEV_COLOR[sev] ?? ([120, 120, 120] as RGB)
      const sevDim   = dim(sevColor, 0.3)

      const descLines = doc.splitTextToSize(finding.description, cW - 12) as string[]
      const recLines  = finding.recommendation
        ? (doc.splitTextToSize(finding.recommendation, cW - 12) as string[])
        : []

      const cardH =
        14 +                                    // badge row
        descLines.length * 4.5 +               // description
        (recLines.length > 0 ? 4 + recLines.length * 4.5 : 0) +  // recommendation
        8                                       // padding

      ensureSpace(cardH + 4)

      // Card background
      doc.setFillColor(18, 8, 36)
      doc.roundedRect(mg, y, cW, cardH, 2, 2, 'F')

      // Severity accent bar (left edge)
      doc.setFillColor(sevColor[0], sevColor[1], sevColor[2])
      doc.rect(mg, y, 3, cardH, 'F')

      // Severity badge
      doc.setFillColor(sevDim[0], sevDim[1], sevDim[2])
      doc.roundedRect(mg + 6, y + 3.5, 22, 7, 1.5, 1.5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(sevColor[0], sevColor[1], sevColor[2])
      doc.text(sev, mg + 6 + 11, y + 8.5, { align: 'center' })

      // Test type + phase
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(100, 100, 140)
      doc.text(
        `${finding.test_type.replace(/_/g, ' ')}  ·  ${finding.phase}`,
        mg + 31, y + 8.5
      )

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(225, 215, 255)
      doc.text(finding.title, mg + 6, y + 18)

      let ly = y + 23.5

      // Description
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(165, 160, 190)
      descLines.forEach((line, i) => doc.text(line, mg + 6, ly + i * 4.5))
      ly += descLines.length * 4.5

      // Recommendation
      if (recLines.length > 0) {
        ly += 3
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(139, 92, 246)
        doc.text('Recommendation:', mg + 6, ly)
        ly += 4.5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(150, 135, 200)
        recLines.forEach((line, i) => doc.text(line, mg + 6, ly + i * 4.5))
      }

      y += cardH + 4
    }
  }

  /* ================================================================ */
  /* FOOTER (every page)                                                */
  /* ================================================================ */
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFillColor(10, 4, 22)
    doc.rect(0, pageH - 11, pageW, 11, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(70, 70, 90)
    doc.text('Generated by AgentRed — Behavioral Trust Scanner for AI Agents', mg, pageH - 4)
    doc.text(`Page ${p} of ${pageCount}`, pageW - mg, pageH - 4, { align: 'right' })
  }

  const filename = `agentred-report-${report.scan_id ?? Date.now()}.pdf`
  doc.save(filename)
}
