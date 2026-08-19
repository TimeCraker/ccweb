import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-text-faint">{label}</span>
      <span className="font-mono text-xs tabular text-text-dim">{value}</span>
    </span>
  )
}

/** 值变化时闪一次 accent 高亮(600ms),消失不打扰 */
function usePulseKey(value: string): number {
  const [key, setKey] = useState(0)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current !== value && value !== '—') {
      prev.current = value
      setKey((k) => k + 1)
    }
  }, [value])
  return key
}

export default function MetricsBar() {
  const m = useStore((s) => s.metrics)
  useLocale()
  const turns = m?.turns ?? 0
  const costStr = m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : '—'
  const pulse = usePulseKey(costStr)

  return (
    <div
      key={pulse}
      className={`flex items-center gap-4 border-t border-border bg-panel px-6 py-1.5 ${pulse ? 'animate-metric' : ''}`}
    >
      <Item label={t('mt.turns')} value={String(turns)} />
      <Item label="in" value={m ? fmt(m.inputTokens) : '—'} />
      <Item label="out" value={m ? fmt(m.outputTokens) : '—'} />
      <Item
        label={t('mt.ttft')}
        value={m?.ttftMs != null ? `${(m.ttftMs / 1000).toFixed(2)}s` : '—'}
      />
      <Item
        label={t('mt.speed')}
        value={m?.tokensPerSecond != null ? `${m.tokensPerSecond.toFixed(1)}/s` : '—'}
      />
      <Item
        label={t('mt.cache')}
        value={m?.cacheHitRate != null ? `${(m.cacheHitRate * 100).toFixed(0)}%` : '—'}
      />
      <Item label={t('mt.cost')} value={costStr} />
    </div>
  )
}
