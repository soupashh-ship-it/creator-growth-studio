/**
 * Minimal dependency-free PDF 1.4 writer (spec §69).
 *
 * Produces a single /Catalog → /Pages → N×/Page tree with one Helvetica text
 * stream per page. Enough for reports (headings, paragraphs, simple tables);
 * ASCII/WinAnsi only — non-ASCII characters are transliterated/stripped, and
 * the UI says the PDF export is plain-text (no images, no rich layout).
 */

const PAGE_W = 612 // US Letter, points
const PAGE_H = 792
const MARGIN = 56
const BODY_SIZE = 10.5
const HEADING_SIZE = 15
const LINE = 14.5

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'line'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'spacer' }

/** Approximate Helvetica average character width at 1pt (rough but stable). */
const AVG_CHAR = 0.52

function wrap(text: string, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(12, Math.floor(maxWidth / (size * AVG_CHAR)))
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`
    if (candidate.length <= maxChars) current = candidate
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/** WinAnsi-safe: map common typography, drop the rest. */
function sanitize(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/·/g, '-')
    .replace(/≈/g, '~')
    .replace(/₹/g, 'Rs.')
    .replace(/→/g, '->')
    .replace(/[^\x20-\x7E\n]/g, '')
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

interface PageText {
  lines: Array<{ text: string; size: number; bold: boolean; gapBefore: number }>
}

function layout(blocks: PdfBlock[]): PageText[] {
  const pages: PageText[] = []
  let page: PageText = { lines: [] }
  let yUsed = MARGIN

  const push = (line: { text: string; size: number; bold: boolean; gapBefore?: number }): void => {
    const needed = (line.gapBefore ?? 0) + LINE * (line.size / BODY_SIZE)
    if (yUsed + needed > PAGE_H - MARGIN) {
      pages.push(page)
      page = { lines: [] }
      yUsed = MARGIN
    }
    page.lines.push({ ...line, gapBefore: line.gapBefore ?? 0 })
    yUsed += needed
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'title': {
        for (const line of wrap(sanitize(block.text), HEADING_SIZE + 2, PAGE_W - 2 * MARGIN)) {
          push({ text: line, size: HEADING_SIZE + 2, bold: true, gapBefore: 4 })
        }
        break
      }
      case 'heading': {
        push({ text: '', size: BODY_SIZE, bold: false, gapBefore: 8 })
        for (const line of wrap(sanitize(block.text), HEADING_SIZE, PAGE_W - 2 * MARGIN)) {
          push({ text: line, size: HEADING_SIZE, bold: true })
        }
        break
      }
      case 'line': {
        for (const line of wrap(sanitize(block.text), BODY_SIZE, PAGE_W - 2 * MARGIN)) {
          push({ text: line, size: BODY_SIZE, bold: false })
        }
        break
      }
      case 'table': {
        for (const row of block.rows) {
          push({ text: sanitize(row.join('   |   ')), size: BODY_SIZE, bold: false })
        }
        break
      }
      case 'spacer': {
        push({ text: '', size: BODY_SIZE, bold: false, gapBefore: 6 })
        break
      }
    }
  }
  pages.push(page)
  return pages
}

/** Serializes the laid-out pages into a valid PDF byte string. */
export function renderPdf(blocks: PdfBlock[]): Uint8Array {
  const pages = layout(blocks)
  const objects: string[] = []

  const pageObjIds: number[] = pages.map((_, i) => 4 + i * 2)
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ')

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((page, i) => {
    const pageId = pageObjIds[i] ?? 4 + i * 2
    const contentId = pageId + 1
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`

    let y = PAGE_H - MARGIN
    let stream = ''
    for (const line of page.lines) {
      y -= line.gapBefore
      y -= LINE * (line.size / BODY_SIZE)
      if (line.text) {
        const font = line.bold ? '/F1 12 Tf' : '/F1 10 Tf'
        stream += `BT ${font} ${line.size} Tf ${MARGIN} ${y.toFixed(1)} Td (${escapePdf(line.text)}) Tj ET\n`
      }
    }
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
  })

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = body.length
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = body.length
  const count = objects.length // includes the unused 0 entry
  body += `xref\n0 ${count}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return new TextEncoder().encode(body)
}

/** Convenience: build a PDF from a title plus plain Markdown-ish text lines. */
export function markdownToPdfBlocks(title: string, markdown: string): PdfBlock[] {
  const blocks: PdfBlock[] = [{ kind: 'title', text: title }]
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('# ')) blocks.push({ kind: 'heading', text: line.slice(2) })
    else if (line.startsWith('## ')) blocks.push({ kind: 'heading', text: line.slice(3) })
    else if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => !(i === 0 && arr[0] === '') )
      const clean = cells.filter((c) => !/^-+$/.test(c))
      const last = blocks[blocks.length - 1]
      if (last && last.kind === 'table' && clean.length > 0) last.rows.push(clean)
      else if (clean.length > 0) blocks.push({ kind: 'table', rows: [clean] })
    } else if (line === '') blocks.push({ kind: 'spacer' })
    else blocks.push({ kind: 'line', text: line.replace(/^[-*]\s+/, '• ').replace(/^•/, '-') })
  }
  return blocks
}
