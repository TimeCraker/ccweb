import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { t, useLocale } from '../i18n'
import type { ToolBlock } from '../render/blocks'
import { ansiToSegments } from '../ansi'
import DiffView from './DiffView'
import {
  IconTerminal,
  IconFile,
  IconEdit,
  IconSearch,
  IconGlobe,
  IconSparkle,
} from './Icon'

/** 执行中耗时:长命令不像卡死 */
function useElapsed(active: boolean): string {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    setSec(0)
    const timer = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [active])
  if (!active) return ''
  return sec >= 60 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${sec}s`
}

const RESULT_LIMIT = 2000

const TOOL_META: Record<string, { icon: ReactNode; label: (input: Record<string, unknown>) => string }> = {
  Bash: { icon: <IconTerminal width={12} height={12} />, label: (input) => String(input.command ?? '').slice(0, 120) },
  Read: { icon: <IconFile width={12} height={12} />, label: (input) => String(input.file_path ?? input.path ?? '') },
  Write: { icon: <IconFile width={12} height={12} />, label: (input) => String(input.file_path ?? input.path ?? '') },
  Edit: { icon: <IconEdit width={12} height={12} />, label: (input) => String(input.file_path ?? input.path ?? '') },
  Glob: { icon: <IconSearch width={12} height={12} />, label: (input) => String(input.pattern ?? '') },
  Grep: { icon: <IconSearch width={12} height={12} />, label: (input) => String(input.pattern ?? '') },
  WebSearch: { icon: <IconGlobe width={12} height={12} />, label: (input) => String(input.query ?? '') },
  WebFetch: { icon: <IconGlobe width={12} height={12} />, label: (input) => String(input.url ?? '') },
  Task: { icon: <IconSparkle width={12} height={12} />, label: (input) => String(input.description ?? input.prompt ?? '') },
}

const STATUS = {
  streaming: { text: 'tl.streaming', color: 'var(--color-text-faint)' },
  running: { text: 'tl.running', color: 'var(--color-accent)' },
  done: { text: 'tl.done', color: 'var(--color-ok)' },
  error: { text: 'tl.error', color: 'var(--color-danger)' },
} as const

export default function ToolCard({ block }: { block: ToolBlock }) {
  // Bash 完成后自动展开一次;用户手动操作后完全交还控制权
  const [userTouched, setUserTouched] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [open, setOpen] = useState(false)
  useLocale()
  const isBashDone = block.toolName === 'Bash' && (block.status === 'done' || block.status === 'error')
  // 失败的工具保持展开,避免异常被折叠成一行状态字
  if ((isBashDone || block.status === 'error') && !autoOpen) setAutoOpen(true)
  const effectiveOpen = userTouched ? open : open || autoOpen
  const elapsed = useElapsed(block.status === 'running' || block.status === 'streaming')
  const meta = TOOL_META[block.toolName]
  const status = STATUS[block.status]
  const summary = useMemo(() => {
    const input = block.input ?? tryParse(block.inputRaw)
    if (input && meta) return meta.label(input)
    if (input) {
      const first = Object.entries(input)[0]
      if (first) return `${String(first[0])}: ${truncate(String(first[1]), 80)}`
    }
    return block.inputRaw ? truncate(block.inputRaw, 80) : '…'
  }, [block.input, block.inputRaw, meta])

  const result = block.resultText
  const truncated = result != null && result.length > RESULT_LIMIT
  const display =
    result != null ? (truncated ? `${result.slice(0, RESULT_LIMIT)}\n…${t('tl.truncated')}` : result) : ''
  const hasAnsi = result != null && result.includes('\x1b')
  const numbered = (block.toolName === 'Read' || block.toolName === 'Grep') && !hasAnsi
  const editPreview = useMemo(() => {
    if (block.toolName !== 'Edit') return null
    const input = block.input ?? tryParse(block.inputRaw)
    if (!input) return null
    const oldStr = typeof input.old_string === 'string' ? input.old_string : null
    const newStr = typeof input.new_string === 'string' ? input.new_string : null
    return oldStr != null && newStr != null ? { oldStr, newStr } : null
  }, [block.toolName, block.input, block.inputRaw])

  return (
    <div className="tool-card">
      <button
        className="tool-card-head"
        aria-expanded={effectiveOpen}
        onClick={() => {
          setUserTouched(true)
          setOpen((value) => !value)
        }}
      >
        <span className="tool-icon">{meta?.icon ?? <IconSparkle width={12} height={12} />}</span>
        <span className="tool-name">{block.toolName}</span>
        <span className="tool-summary" title={summary}>
          {summary}
        </span>
        {block.status === 'running' && (
          <span
            aria-hidden="true"
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              border: '1.5px solid var(--color-accent)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
              flex: '0 0 auto',
            }}
          />
        )}
        <span className="tool-status" style={{ color: status.color }}>
          {t(status.text)}
          {elapsed ? ` ${elapsed}` : ''}
        </span>
        <svg className="tool-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      <div className={`tool-expand ${effectiveOpen ? 'open' : ''}`}>
        <div>
          <details className="tool-parameters" open={!numbered || result == null}>
            <summary>{t('tl.params')}</summary>
            <pre>{block.input ? JSON.stringify(block.input, null, 2) : block.inputRaw || t('tl.receiving')}</pre>
          </details>
          {editPreview && (
            <div className="tool-block">
              <p className="label">{t('tl.diffPreview')}</p>
              <DiffView oldStr={editPreview.oldStr} newStr={editPreview.newStr} />
            </div>
          )}
          {result != null && (
            <div className="tool-block">
              <p className="label">{t('tl.result')}</p>
              <pre className={`tool-pre ${block.status === 'error' ? 'error' : ''}`}>
                {hasAnsi
                  ? ansiToSegments(display).map((segment, index) => (
                      <span key={index} style={segment.fg ? { color: segment.fg } : undefined} className={segment.bold ? 'font-bold' : undefined}>
                        {segment.text}
                      </span>
                    ))
                  : numbered
                    ? display.split('\n').map((line, index) => (
                        <span key={index} style={{ display: 'block' }}>
                          <span style={{ display: 'inline-block', width: 30, marginRight: 10, textAlign: 'right', color: 'var(--color-text-faint)', userSelect: 'none' }}>
                            {index + 1}
                          </span>
                          {line}
                        </span>
                      ))
                    : display}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
