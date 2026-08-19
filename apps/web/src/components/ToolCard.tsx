import { useMemo, useState, type ReactNode } from 'react'
import type { ToolBlock } from '../render/blocks'
import {
  IconTerminal,
  IconFile,
  IconEdit,
  IconSearch,
  IconGlobe,
  IconSparkle,
} from './Icon'

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
  streaming: { text: '参数', cls: 'text-text-faint' },
  running: { text: '执行中', cls: 'text-accent' },
  done: { text: '完成', cls: 'text-ok' },
  error: { text: '失败', cls: 'text-danger' },
} as const

export default function ToolCard({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="tool-card my-1.5 overflow-hidden rounded-lg border border-border bg-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
        <span className={`shrink-0 text-[10px] ${badge.cls}`}>{badge.text}</span>
        <span className={`shrink-0 text-text-faint transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
      </button>

      <div className={`tool-expand ${open ? 'open' : ''}`}>
        <div>
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">参数</p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg px-3 py-2 font-mono text-[11px] text-text-dim">
              {block.input ? JSON.stringify(block.input, null, 2) : block.inputRaw || '(流式接收中…)'}
            </pre>
          </div>
          {result != null && (
            <div className="border-t border-border px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">结果</p>
              <pre
                className={`max-h-72 overflow-auto whitespace-pre-wrap rounded border px-3 py-2 font-mono text-[11px] ${
                  block.status === 'error'
                    ? 'border-danger/30 bg-danger/5 text-danger'
                    : 'border-border bg-bg text-text-dim'
                }`}
              >
                {truncate(result, RESULT_LIMIT)}
                {truncated ? '\n…(截断,完整结果见终端会话)' : ''}
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
