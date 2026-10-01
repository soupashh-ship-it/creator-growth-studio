/**
 * Export/import utilities (spec §69, §128). Pure string transforms so they can be
 * used from the renderer, main process, or tests, and wired to save dialogs.
 */
export type ExportFormat = 'csv' | 'json' | 'markdown'

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return ''
  const headers = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','))
  }
  return lines.join('\r\n')
}

/**
 * Minimal RFC4180 CSV parser (handles quotes, escaped quotes, CRLF) used by the
 * CSV import feature (spec §128) — no dependency required.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function csvToRecords(input: string): Array<Record<string, string>> {
  const rows = parseCsv(input)
  const header = rows[0]
  if (!header) return []
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    header.forEach((key, index) => {
      record[key.trim()] = row[index] ?? ''
    })
    return record
  })
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function toMarkdownTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '_No rows._'
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const header = `| ${headers.join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map(
    (row) => `| ${headers.map((h) => (row[h] === null || row[h] === undefined ? '' : String(row[h]))).join(' | ')} |`,
  )
  return [header, divider, ...body].join('\n')
}

export interface ReportSection {
  heading: string
  lines: string[]
}

/** Markdown report used by the Monthly Review, SEO report, etc. (spec §69, §148). */
export function reportToMarkdown(
  title: string,
  sections: ReportSection[],
  meta: { generatedAt: string; workspace?: string },
): string {
  const header = [
    `# ${title}`,
    '',
    `_Generated ${meta.generatedAt}${meta.workspace ? ` · workspace: ${meta.workspace}` : ''}_`,
    '',
    '> Application-generated report. Values are labelled with their source; scores are heuristic.',
    '',
  ]
  const body = sections.flatMap((section) => [`## ${section.heading}`, '', ...section.lines, ''])
  return [...header, ...body].join('\n')
}
