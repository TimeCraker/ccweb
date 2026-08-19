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
    <aside className="hidden w-52 shrink-0 flex-col border-l border-border bg-panel md:flex">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-faint">上下文</h3>
      </div>

      {/* 高水位警示:接近压缩阈值时主动提醒(不只靠环形图变色) */}
      {level && pct > 85 && (
        <div className="border-b border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
          上下文已用 {pct.toFixed(0)}% — 临近自动压缩,长会话建议新建或让模型 /compact
        </div>
      )}

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
          Token 构成
        </h3>
        {m && m.inputTokens + m.cacheReadTokens + m.cacheCreationTokens > 0 ? (
          <div>
            <div className="flex h-2 overflow-hidden rounded-full border border-border">
              <div
                className="bg-accent transition-all duration-500"
                style={{ width: `${pctOf(m.inputTokens, m)}%` }}
                title="原始输入"
              />
              <div
                className="bg-ok transition-all duration-500"
                style={{ width: `${pctOf(m.cacheReadTokens, m)}%` }}
                title="缓存读"
              />
              <div
                className="bg-warn transition-all duration-500"
                style={{ width: `${pctOf(m.cacheCreationTokens, m)}%` }}
                title="缓存写"
              />
            </div>
            <div className="mt-2 space-y-1">
              <Legend color="bg-accent" k="原始输入" v={fmtTokens(m.inputTokens)} />
              <Legend color="bg-ok" k="缓存读" v={fmtTokens(m.cacheReadTokens)} />
              <Legend color="bg-warn" k="缓存写" v={fmtTokens(m.cacheCreationTokens)} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-text-faint">对话后显示</p>
        )}

        <h3 className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-text-faint">
          会话累计
        </h3>
        <dl className="space-y-1.5 text-xs">
          <Row k="输出" v={m ? fmtTokens(m.outputTokens) : '—'} />
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

function Legend({ color, k, v }: { color: string; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={`size-2 rounded-sm ${color}`} />
      <span className="text-text-faint">{k}</span>
      <span className="ml-auto font-mono text-text-dim">{v}</span>
    </div>
  )
}

function pctOf(n: number, m: { inputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }): number {
  const total = m.inputTokens + m.cacheReadTokens + m.cacheCreationTokens
  return total > 0 ? (n / total) * 100 : 0
}
