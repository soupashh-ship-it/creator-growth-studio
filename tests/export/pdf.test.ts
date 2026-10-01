import { describe, expect, it } from 'vitest'
import { renderPdf, markdownToPdfBlocks } from '../../export/pdf'

describe('pdf export (§69)', () => {
  it('produces a valid PDF 1.4 header and trailer', () => {
    const bytes = renderPdf([{ kind: 'title', text: 'Report' }, { kind: 'line', text: 'Hello world' }])
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Page')
  })

  it('escapes parentheses and backslashes in text', () => {
    const bytes = renderPdf([{ kind: 'line', text: 'CTR (best) 5% \\ ok' }])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('CTR \\(best\\) 5% \\\\ ok')
  })

  it('sanitizes typography into WinAnsi-safe text', () => {
    const bytes = renderPdf([{ kind: 'line', text: 'Views ≈ 1 200 → up' }])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('Views ~ 1 200 -> up')
    expect(text).not.toContain('≈')
    expect(text).not.toContain('→')
  })

  it('paginates long content into multiple pages', () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ kind: 'line' as const, text: `Line ${i} with some content to fill the page.` }))
    const bytes = renderPdf(lines)
    const text = new TextDecoder().decode(bytes)
    const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length
    expect(pageCount).toBeGreaterThan(1)
  })

  it('converts markdown-ish text into blocks', () => {
    const blocks = markdownToPdfBlocks('Monthly Review', '# Growth\n- views up\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Monthly Review' })
    expect(blocks.some((b) => b.kind === 'heading' && b.text === 'Growth')).toBe(true)
    expect(blocks.some((b) => b.kind === 'table')).toBe(true)
  })
})
