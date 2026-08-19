import { useStore } from '../store'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function Item({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-text-faint">{label}</span>
      <span className={`text-xs text-text-dim ${mono ? 'font-mono' : ''}`}>{value}</span>
    </span>
  )
}

export default function MetricsBar() {
  const m = useStore((s) => s.metrics)
  const turns = m?.turns ?? 0

  return (
    <div className="flex items-center gap-4 border-t border-border bg-panel px-6 py-1.5">
      <Item label="轮数" value={String(turns)} />
      <Item label="in" value={m ? fmt(m.inputTokens) : '—'} />
      <Item label="out" value={m ? fmt(m.outputTokens) : '—'} />
      <Item
        label="TTFT"
        value={m?.ttftMs != null ? `${(m.ttftMs / 1000).toFixed(2)}s` : '—'}
      />
      <Item
        label="速度"
        value={m?.tokensPerSecond != null ? `${m.tokensPerSecond.toFixed(1)}/s` : '—'}
      />
      <Item
        label="缓存命中"
        value={m?.cacheHitRate != null ? `${(m.cacheHitRate * 100).toFixed(0)}%` : '—'}
      />
      <Item
        label="成本"
        value={m?.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : '—'}
      />
    </div>
  )
}
