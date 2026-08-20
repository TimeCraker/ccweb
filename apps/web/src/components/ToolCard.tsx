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

/** 执行中耗时(dsh 对齐:长命令不像卡死) */
function useElapsed(active: boolean): string {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    setSec(0)
    const t = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [active])
  if (!active) return ''
  return sec >= 60 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${sec}s`
}

const RESULT_LIMIT = 2000

const TOOL_META: Record<string, { icon: ReactNode; label: (i: Record<string, unknown>) => string }> = {
  Bash: { icon: <IconTerminal width={12} height={12} />, label: (i) => String(i.command ?? '').slice(0, 120) },
  Read: { icon: <IconFile width={12} height={12} />, label: (i) => String(i.file_path ?? i.path ?? '') },
  Write: { icon: <IconFile width={12} height={12} />, label: (i) => String(i.file_path ?? i.path ?? '') },
  Edit: { icon: <IconEdit width={12} height={12} />, label: (i) => String(i.file_path ?? i.path ?? '') },
  Glob: { icon: <IconSearch width={12} height={12} />, label: (i) => String(i.pattern ?? '') },
  Grep: { icon: <IconSearch width={12} height={12} />, label: (i) => String(i.pattern ?? '') },
  WebSearch: { icon: <IconGlobe width={12} height={12} />, label: (i) => String(i.query ?? '') },
  WebFetch: { icon: <IconGlobe width={12} height={12} />, label: (i) => String(i.url ?? '') },
  Task: { icon: <IconSparkle width={12} height={12} />, label: (i) => String(i.description ?? i.prompt ?? '') },
}

const STATUS_BADGE = {
  streaming: { text: 'tl.streaming', cls: 'text-text-faint' },
  running: { text: 'tl.running', cls: 'text-accent' },
  done: { text: 'tl.done', cls: 'text-ok' },
  error: { text: 'tl.error', cls: 'text-danger' },
} as const

export default function ToolCard({ block }: { block: ToolBlock }) {
  // dsh 对齐:Bash 完成后自动展开一次;用户手动操作后完全交还控制权
  const [userTouched, setUserTouched] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [open, setOpen] = useState(false)
  useLocale()
  const isBashDone = block.toolName === 'Bash' && (block.status === 'done' || block.status === 'error')
  if (isBashDone && !autoOpen) setAutoOpen(true)
  const effectiveOpen = userTouched ? open : open || autoOpen
  const elapsed = useElapsed(block.status === 'running' || block.status === 'streaming')
  const meta = TOOL_META[block.toolName]
  const badge = STATUS_BADGE[block.status]
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
  // ANSI 着色(Bash 输出):含转义时切带色 span 渲染,否则原样
  const display =
    result != null
      ? truncated
        ? `${result.slice(0, RESULT_LIMIT)}\n…${t('tl.truncated')}`
        : result
      : ''
  const hasAnsi = result != null && result.includes('\x1b')
  // Read/Grep 结果逐行行号(文件阅读感);ANSI 路径保持原样
  const numbered = (block.toolName === 'Read' || block.toolName === 'Grep') && !hasAnsi
  // Edit 变更预览:input.old_string → new_string 行级 diff
  const editPreview = useMemo(() => {
    if (block.toolName !== 'Edit') return null
    const input = block.input ?? tryParse(block.inputRaw)
    if (!input) return null
    const oldStr = typeof input.old_string === 'string' ? input.old_string : null
    const newStr = typeof input.new_string === 'string' ? input.new_string : null
    return oldStr != null && newStr != null ? { oldStr, newStr } : null
  }, [block.toolName, block.input, block.inputRaw])

  return (
    <div className="tool-card my-1.5 overflow-hidden rounded-lg border border-border bg-panel">
      <button
        onClick={() => {
          setUserTouched(true)
          setOpen((v) => !v)
        }}
        aria-expanded={effectiveOpen}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-panel-2"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded border border-border bg-panel-2 text-text-dim">
          {meta?.icon ?? <IconSparkle width={12} height={12} />}
        </span>
        <span className="font-mono text-xs font-medium text-text-dim">{block.toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-faint">
          {summary}
        </span>
        {block.status === 'running' && (
          <span className="size-3 shrink-0 animate-spin rounded-full border border-accent border-t-transparent" />
        )}
        <span className={`shrink-0 font-mono text-[10px] ${badge.cls}`}>
          {t(badge.text)}
          {elapsed ? ` ${elapsed}` : ''}
        </span>
        <span className={`shrink-0 text-text-faint transition-transform ${effectiveOpen ? 'rotate-90' : ''}`}>▸</span>
      </button>

      <div className={`tool-expand ${effectiveOpen ? 'open' : ''}`}>
        <div>
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">{t('tl.params')}</p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg px-3 py-2 font-mono text-[11px] text-text-dim">
              {block.input ? JSON.stringify(block.input, null, 2) : block.inputRaw || t('tl.receiving')}
            </pre>
          </div>
          {editPreview && (
            <div className="border-t border-border px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">{t('tl.diffPreview')}</p>
              <DiffView oldStr={editPreview.oldStr} newStr={editPreview.newStr} />
            </div>
          )}
          {result != null && (
            <div className="border-t border-border px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">{t('tl.result')}</p>
              <pre
                className={`max-h-72 overflow-auto whitespace-pre-wrap rounded border px-3 py-2 font-mono text-[11px] ${
                  block.status === 'error'
                    ? 'border-danger/30 bg-danger/5 text-danger'
                    : 'border-border bg-bg text-text-dim'
                }`}
              >
                {hasAnsi
                  ? ansiToSegments(display).map((seg, i) => (
                      <span
                        key={i}
                        style={seg.fg ? { color: seg.fg } : undefined}
                        className={seg.bold ? 'font-bold' : undefined}
                      >
                        {seg.text}
                      </span>
                    ))
                  : numbered
                    ? display.split('\n').map((line, i) => (
                        <span key={i} className="block">
                          <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-text-faint">
                            {i + 1}
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
    const v = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
