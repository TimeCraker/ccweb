import { useStore } from '../store'
import { useMemo } from 'react'

/** 从 getContextUsage 透传对象中宽松提取水位(字段名跨版本可能不同) */
function extractUsage(raw: Record<string, unknown> | null): { used: number; max: number } | null {
  if (!raw) return null
  const num = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null)
  // 常见字段形状逐一尝试
  const used =
    num(raw.usedTokens) ?? num(raw.used_tokens) ?? num(raw.inputTokens) ?? num(raw.contextTokens)
  const max =
    num(raw.maxTokens) ?? num(raw.max_tokens) ?? num(raw.contextWindow) ?? num(raw.contextLimit)
  if (used != null && max != null) return { used, max }
  return null
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export default function ContextPanel() {
  const ctx = useStore((s) => s.context)
  const m = useStore((s) => s.metrics)

  const level = useMemo(() => extractUsage(ctx?.raw ?? null), [ctx])
  const pct = level ? Math.min(100, (level.used / level.max) * 100) : 0
  const ringColor = pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warn)' : 'var(--color-accent)'
  const circumference = 2 * Math.PI * 26

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-l border-border bg-panel xl:flex">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-faint">上下文</h3>
      </div>

      <div className="flex flex-col items-center gap-3 border-b border-border px-4 py-5">
        {level ? (
          <>
            <svg viewBox="0 0 64 64" className="size-20 -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-border)" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct / 100)}
                className="transition-all duration-500"
              />
            </svg>
            <div className="text-center">
              <p className="font-mono text-sm">{pct.toFixed(0)}%</p>
              <p className="mt-0.5 font-mono text-[11px] text-text-faint">
                {fmtTokens(level.used)} / {fmtTokens(level.max)}
              </p>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-xs text-text-faint">
            对话开始后
            <br />
            显示上下文水位
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
          会话统计
        </h3>
        <dl className="space-y-1.5 text-xs">
          <Row k="输入" v={m ? fmtTokens(m.inputTokens) : '—'} />
          <Row k="输出" v={m ? fmtTokens(m.outputTokens) : '—'} />
          <Row k="缓存读" v={m ? fmtTokens(m.cacheReadTokens) : '—'} />
          <Row k="缓存写" v={m ? fmtTokens(m.cacheCreationTokens) : '—'} />
          <Row k="TTFT" v={m?.ttftMs != null ? `${(m.ttftMs / 1000).toFixed(2)}s` : '—'} />
          <Row k="速度" v={m?.tokensPerSecond != null ? `${m.tokensPerSecond.toFixed(0)} t/s` : '—'} />
          <Row k="成本" v={m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : '—'} />
        </dl>
      </div>
    </aside>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-text-faint">{k}</dt>
      <dd className="font-mono text-text-dim">{v}</dd>
    </div>
  )
}
