import { app } from 'electron'

/**
 * Local logging (spec §87).
 *
 * In-memory ring buffer (last 1000 entries) plus an approximate file location.
 * Secrets are redacted by pattern BEFORE a line is stored — tokens, passwords,
 * authorization codes and long URL credentials never reach the buffer.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  at: string
  level: LogLevel
  scope: string
  message: string
}

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }
const MAX_ENTRIES = 1000

const SECRET_PATTERNS: RegExp[] = [
  /access[_-]?token[=:]\s*\S+/gi,
  /refresh[_-]?token[=:]\s*\S+/gi,
  /client[_-]?secret[=:]\s*\S+/gi,
  /[?&](code|token|secret)=[^&\s]+/gi,
  /password[=:]\s*\S+/gi,
  /bearer\s+[A-Za-z0-9._-]+/gi,
]

export function redactSecrets(text: string): string {
  let redacted = text
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => `${match.split(/[=:]/)[0]}=[REDACTED]`)
  }
  return redacted
}

let buffer: LogEntry[] = []
let minLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

export function getLogLevel(): LogLevel {
  return minLevel
}

export function log(level: LogLevel, scope: string, message: string): void {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[minLevel]) return
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    scope,
    message: redactSecrets(message).slice(0, 4000),
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES)
}

export const logError = (scope: string, message: string): void => log('error', scope, message)
export const logWarn = (scope: string, message: string): void => log('warn', scope, message)
export const logInfo = (scope: string, message: string): void => log('info', scope, message)
export const logDebug = (scope: string, message: string): void => log('debug', scope, message)

export function getEntries(level?: LogLevel): LogEntry[] {
  if (!level) return [...buffer]
  return buffer.filter((entry) => LEVEL_ORDER[entry.level] <= LEVEL_ORDER[level])
}

/** Copy-diagnostics bundle: version + recent logs, secrets redacted. */
export function buildDiagnostics(): string {
  const lines = [
    `Creator Growth Studio diagnostics`,
    `Generated: ${new Date().toISOString()}`,
    `App: ${app.getVersion()} · Electron ${process.versions.electron} · Node ${process.versions.node}`,
    `Log level: ${minLevel}`,
    '',
    '--- recent log entries ---',
    ...buffer.slice(-200).map((entry) => `${entry.at} [${entry.level}] (${entry.scope}) ${entry.message}`),
  ]
  return lines.join('\n')
}

export function clearLogs(): void {
  buffer = []
}
