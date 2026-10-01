import { describe, expect, it } from 'vitest'
import { csvToRecords, parseCsv, reportToMarkdown, toCsv, toJson, toMarkdownTable } from '@export/exporters'

describe('CSV export', () => {
  it('writes a header and escapes special characters', () => {
    const csv = toCsv([{ title: 'Hello, world', views: 10 }, { title: 'He said "hi"', views: 20 }])
    expect(csv.split('\r\n')[0]).toBe('title,views')
    expect(csv).toContain('"Hello, world"')
    expect(csv).toContain('"He said ""hi"""')
  })

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('supports explicit column order', () => {
    const csv = toCsv([{ b: 2, a: 1 }], ['a', 'b'])
    expect(csv.split('\r\n')[0]).toBe('a,b')
  })
})

describe('CSV import', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')
    expect(rows[0]).toEqual(['a', 'b'])
    expect(rows[1]).toEqual(['x,1', 'he said "hi"'])
  })

  it('converts to records keyed by header', () => {
    const records = csvToRecords('title,views\nA,10\nB,20\n')
    expect(records).toEqual([
      { title: 'A', views: '10' },
      { title: 'B', views: '20' },
    ])
  })

  it('round-trips through export then import', () => {
    const original = [{ title: 'With, comma', views: 5 }]
    const records = csvToRecords(toCsv(original))
    expect(records[0]).toEqual({ title: 'With, comma', views: '5' })
  })
})

describe('other formats', () => {
  it('writes pretty JSON', () => {
    expect(toJson({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('writes a markdown table', () => {
    const table = toMarkdownTable([{ a: 1, b: 2 }])
    expect(table.split('\n')[0]).toBe('| a | b |')
    expect(table).toContain('| 1 | 2 |')
  })

  it('writes a labelled markdown report', () => {
    const report = reportToMarkdown(
      'Monthly Review',
      [{ heading: 'What grew', lines: ['- Views +18%'] }],
      { generatedAt: '2026-09-30T00:00:00Z', workspace: 'SupAshh' },
    )
    expect(report).toContain('# Monthly Review')
    expect(report).toContain('## What grew')
    expect(report).toContain('heuristic')
  })
})
