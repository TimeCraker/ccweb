import { contextUsage } from '../context-usage'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
function format(value: number | null | undefined, suffix = '') { return value == null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}` }
export default function MetricsBar() {
  const metrics = useStore(s => s.metrics)
  const busy = useStore(s => s.busy)
  const context = useStore(s => s.context)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [busy])
  const percentage = contextUsage(context?.raw)?.percentage ?? null
  const duration = metrics?.runStartedAt ? Math.max(0, ((metrics.completedAt ?? now) - metrics.runStartedAt) / 1000) : null
  return <div className="metrics-dock" aria-label="运行指标">
    <div className="metrics-strip"><span>{metrics?.speedScope === 'turn' ? '本轮均速' : busy ? '最近请求' : '上次请求'} <strong>{format(metrics?.tokensPerSecond, ' tok/s')}</strong></span><span>首个输出 <strong>{format(metrics?.firstContentMs == null ? null : metrics.firstContentMs / 1000, 's')}</strong></span><span>本轮 <strong>{format(duration, 's')}</strong>{metrics?.terminalStatus === 'failed' ? ' · 失败' : metrics?.terminalStatus === 'cancelled' ? ' · 已取消' : ''}</span><span className="context-metric" title="原生运行时报告的当前上下文窗口占用">上下文 <strong>{format(percentage, '%')}</strong><meter min={0} max={100} value={percentage ?? 0} aria-label="上下文水位" /></span><button aria-expanded={open} onClick={() => setOpen(!open)}>用量详情 {open ? '⌃' : '⌄'}</button></div>
    {open && <div className="metrics-details"><dl><dt>会话输入</dt><dd>{format(metrics?.inputTokens)}</dd><dt>会话输出</dt><dd>{format(metrics?.outputTokens)}</dd><dt>缓存命中</dt><dd>{format(metrics?.cacheHitRate == null ? null : metrics.cacheHitRate * 100, '%')}</dd><dt>SDK TTFT（原生字段）</dt><dd>{format(metrics?.ttftMs, 'ms')}</dd><dt>SDK 估算费用</dt><dd>{metrics?.totalCostUsd == null ? '未提供计价' : `$${metrics.totalCostUsd.toFixed(4)}`}</dd><dt>原生运行耗时</dt><dd>{format(metrics?.nativeTiming?.durationMs, "ms")}</dd><dt>原生 API 耗时</dt><dd>{format(metrics?.nativeTiming?.apiDurationMs, "ms")}</dd><dt>配对请求</dt><dd>{format(metrics?.sampledRequests)} · {metrics?.metricsComplete ? '完整' : '统计中或数据不完整'}</dd></dl><p>运行：{metrics?.runId ?? "未记录"} · 子请求明细与单项工具耗时：当前未提供</p>{metrics?.requests?.map(request => <p key={request.requestId}><code>{request.requestId}</code> · 流开启 {new Date(request.streamOpenedAt).toLocaleTimeString()} · 首内容 {request.firstContentAt === null ? "缺失" : `${request.firstContentAt - request.streamOpenedAt}ms`} · 输出 {format(request.outputTokens)} Token / {format(request.outputDurationMs, "ms")}</p>)}<p>速度仅使用配对的实际 Token 与模型输出耗时，不包含审批、工具或排队等待。缺失值不按字符估算。SDK 费用为本地估算，不是账单。</p></div>}
  </div>
}
