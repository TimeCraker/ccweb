import { useStore } from '../store'
import { t, tf, useLocale } from '../i18n'
import { useMemo, useState } from 'react'
import type { ToolBlock } from '../render/blocks'

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

/** 轨迹条目摘要:command / file_path / pattern 等取一,截断 */
function trajectorySummary(input: Record<string, unknown> | null): string {
  if (!input) return '…'
  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
    const v = input[key]
    if (typeof v === 'string' && v !== '') return truncate(v, 60)
  }
  const first = Object.values(input)[0]
  return first != null ? truncate(String(first), 60) : '…'
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

interface TrajectoryItem {
  id: string
  toolName: string
  status: ToolBlock['status']
  summary: string
}

/** 松散解析工具参数流(inputRaw 可能不完整) */
function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export default function ContextPanel() {
  const [tab, setTab] = useState<'context' | 'trajectory'>('context')
  const ctx = useStore((s) => s.context)
  const m = useStore((s) => s.metrics)
  const entries = useStore((s) => s.entries)
  useLocale()

  const level = useMemo(() => extractUsage(ctx?.raw ?? null), [ctx])
  const pct = level ? Math.min(100, (level.used / level.max) * 100) : 0
  const ringColor = pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warn)' : 'var(--color-accent)'
  const circumference = 2 * Math.PI * 26

  // 调用轨迹:全部 turn 中的 tool 块按序展开(selector 取 entries 原引用,派生放 useMemo)
  const trajectory = useMemo(() => {
    const items: TrajectoryItem[] = []
    for (const e of entries) {
      if (e.type !== 'turn') continue
      for (const b of e.blocks) {
        if (b.kind !== 'tool') continue
        items.push({
          id: `${e.id}:${b.toolUseId}`,
          toolName: b.toolName,
          status: b.status,
          summary: trajectorySummary(b.input ?? tryParse(b.inputRaw)),
        })
      }
    }
    return items
  }, [entries])

  return (
    <aside className="hidden w-52 shrink-0 flex-col border-l border-border bg-panel xl:flex">
      <div className="flex shrink-0 border-b border-border">
        {(['context', 'trajectory'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative flex-1 py-3 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              tab === k ? 'text-text' : 'text-text-faint hover:text-text-dim'
            }`}
          >
            {t(k === 'context' ? 'ctx.tab.context' : 'ctx.tab.trajectory')}
            {tab === k && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
          </button>
        ))}
      </div>

      {tab === 'context' ? (
        <>
          {/* 高水位警示:接近压缩阈值时主动提醒(不只靠环形图变色) */}
          {level && pct > 85 && (
            <div className="border-b border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
              {tf('ctx.warn', Math.round(pct))}
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
              <div className="py-6 text-center text-xs text-text-faint">{t('ctx.waiting')}</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
              {t('ctx.composition')}
            </h3>
            {m && m.inputTokens + m.cacheReadTokens + m.cacheCreationTokens > 0 ? (
              <div>
                <div className="flex h-2 overflow-hidden rounded-full border border-border">
                  <div
                    className="bg-accent transition-all duration-500"
                    style={{ width: `${pctOf(m.inputTokens, m)}%` }}
                    title={t('ctx.fresh')}
                  />
                  <div
                    className="bg-ok transition-all duration-500"
                    style={{ width: `${pctOf(m.cacheReadTokens, m)}%` }}
                    title={t('ctx.cacheRead')}
                  />
                  <div
                    className="bg-warn transition-all duration-500"
                    style={{ width: `${pctOf(m.cacheCreationTokens, m)}%` }}
                    title={t('ctx.cacheWrite')}
                  />
                </div>
                <div className="mt-2 space-y-1">
                  <Legend color="bg-accent" k={t('ctx.fresh')} v={fmtTokens(m.inputTokens)} />
                  <Legend color="bg-ok" k={t('ctx.cacheRead')} v={fmtTokens(m.cacheReadTokens)} />
                  <Legend color="bg-warn" k={t('ctx.cacheWrite')} v={fmtTokens(m.cacheCreationTokens)} />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-text-faint">{t('ctx.afterChat')}</p>
            )}

            <h3 className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-text-faint">
              {t('ctx.total')}
            </h3>
            <dl className="space-y-1.5 text-xs">
              <Row k={t('ctx.output')} v={m ? fmtTokens(m.outputTokens) : '—'} />
              <Row k={t('mt.cost')} v={m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : '—'} />
            </dl>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto py-3">
          {trajectory.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-text-faint">{t('ctx.noTrajectory')}</p>
          ) : (
            <ol>
              {trajectory.map((it, i) => (
                <li key={it.id} className="relative flex gap-2.5 px-4 pb-3">
                  {i < trajectory.length - 1 && (
                    <span className="absolute bottom-0 left-1 top-4 w-px bg-border" />
                  )}
                  <span
                    className={`relative z-10 mt-0.5 size-2 shrink-0 rounded-full ring-3 ring-panel ${
                      it.status === 'error'
                        ? 'bg-danger'
                        : it.status === 'done'
                          ? 'bg-ok'
                          : it.status === 'running'
                            ? 'animate-pulse bg-accent'
                            : 'bg-accent/60'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-medium text-text-dim">{it.toolName}</p>
                    <p className="truncate font-mono text-[10px] text-text-faint" title={it.summary}>
                      {it.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
