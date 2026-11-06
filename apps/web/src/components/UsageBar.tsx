import { contextUsage } from '../context-usage'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { Menu } from './ui/Menu'
import { IconChevron, IconClock, IconCpu, IconFlame, IconZap } from './Icon'

function num(value: number | null | undefined, suffix = ''): string {
  if (value == null) return '—'
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
}

function money(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value === 0) return '$0'
  return `$${value.toFixed(value < 0.01 ? 4 : 3)}`
}

function ms(value: number | null | undefined): string {
  if (value == null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}

/**
 * 输入区下方的一行低噪用量摘要 + 锚定弹层。
 * 空态不渲染占位破折号;诊断字段默认收起;外点/Esc 关闭由 Menu 原语保证。
 */
export default function UsageBar({ onOpenDetails }: { onOpenDetails?: (tab?: 'context' | 'controls') => void } = {}) {
  const metrics = useStore((s) => s.metrics)
  const busy = useStore((s) => s.busy)
  const context = useStore((s) => s.context)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const ctx = contextUsage(context?.raw)
  const percentage = ctx?.percentage ?? null
  const usedTokens = ctx?.used ?? (metrics?.inputTokens ? metrics.inputTokens + (metrics.outputTokens ?? 0) : null)
  const maxTokens = ctx?.max ?? null

  const duration = metrics?.runStartedAt ? Math.max(0, ((metrics.completedAt ?? now) - metrics.runStartedAt) / 1000) : null
  const speed = metrics?.tokensPerSecond ?? null
  const hasData =
    speed != null ||
    duration != null ||
    percentage != null ||
    (metrics?.inputTokens ?? 0) > 0 ||
    (metrics?.outputTokens ?? 0) > 0
  if (!hasData) {
    return (
      <div className="usage usage-empty" aria-label={t('us.title')}>
        <span className="usage-tip">Enter 发送 · Shift + Enter 换行</span>
      </div>
    )
  }

  const failed = metrics?.terminalStatus === 'failed'
  const cancelled = metrics?.terminalStatus === 'cancelled'
  const scope = t('us.session')
  const cacheHitRate = metrics?.cacheHitRate != null ? metrics.cacheHitRate : null

  return (
    <div className="usage usage-metric-strip" aria-label={t('us.title')}>
      {duration != null && (
        <span className="usage-item" title="当前耗时">
          <span className="usage-icon">
            <IconClock width={12} height={12} />
          </span>
          <span className="usage-label">{failed ? '失败于' : cancelled ? '取消于' : '耗时'}</span>
          <b>{num(duration, 's')}</b>
        </span>
      )}
      {speed != null && (
        <span className="usage-item" title="生成速率">
          <span className="usage-icon">
            <IconZap width={12} height={12} />
          </span>
          <span className="usage-label">{metrics?.speedScope === 'turn' ? '均速' : '速率'}</span>
          <b>{num(speed)} tok/s</b>
        </span>
      )}
      {percentage != null && (
        <span
          className={`usage-item ${percentage >= 85 ? 'is-danger' : percentage >= 70 ? 'is-warn' : ''} ${onOpenDetails ? 'is-clickable' : ''}`}
          title={
            onOpenDetails
              ? `当前上下文容量：${usedTokens != null ? Math.round(usedTokens / 1000) + 'k' : ''}${maxTokens ? ' / ' + Math.round(maxTokens / 1000) + 'k' : ''} (${num(percentage, '%')})，点击在伴侣抽屉查看明细`
              : `当前上下文占用：${num(percentage, '%')}`
          }
          onClick={onOpenDetails ? () => onOpenDetails('context') : undefined}
          style={onOpenDetails ? { cursor: 'pointer' } : undefined}
        >
          <span className="usage-icon">
            <IconCpu width={12} height={12} />
          </span>
          <span className="usage-label">上下文</span>
          <b>
            {maxTokens && usedTokens
              ? `${Math.round(usedTokens / 1000)}k/${Math.round(maxTokens / 1000)}k`
              : num(percentage, '%')}
          </b>
        </span>
      )}
      {cacheHitRate != null && cacheHitRate > 0 && (
        <span className="usage-item" title="Prompt 缓存命中率">
          <span className="usage-icon">
            <IconFlame width={12} height={12} />
          </span>
          <span className="usage-label">缓存</span>
          <b>{num(cacheHitRate * 100, '%')}</b>
        </span>
      )}
      <Menu
        label={t('us.title')}
        align="end"
        width={316}
        trigger={({ open }) => (
          <button className="usage-trigger" aria-expanded={open} title="查看详细用量与诊断">
            <span style={{ fontSize: 10, marginRight: 2 }}>详情</span>
            <IconChevron
              width={10}
              height={10}
              style={{ transform: open ? 'rotate(180deg)' : undefined }}
            />
          </button>
        )}
      >
        {() => (
          <div className="usage-panel">
            <h4>
              <span>{scope}</span>
              <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: 11 }}>
                {failed ? '失败' : cancelled ? '已取消' : busy ? '运行中' : metrics ? '已完成' : ''}
              </span>
            </h4>
            <dl>
              <dt>{t('us.input')}</dt>
              <dd>{num(metrics?.inputTokens)}</dd>
              <dt>{t('us.output')}</dt>
              <dd>{num(metrics?.outputTokens)}</dd>
              {percentage != null && (
                <>
                  <dt>{t('us.context')}</dt>
                  <dd>{num(percentage, '%')}</dd>
                </>
              )}
              <dt>{t('us.cost')}</dt>
              <dd>{money(metrics?.totalCostUsd)}</dd>
            </dl>
            {metrics?.totalCostUsd != null && <p className="usage-foot">{t('us.costNote')}</p>}
            {metrics && <p className="usage-foot">{t('us.cumulative')}</p>}

            <details className="usage-details">
              <summary>{t('us.diag')}</summary>
              <p className="usage-foot" style={{ marginTop: 4 }}>
                {t('us.diagHint')}
              </p>
              <dl>
                <dt>{t('us.firstToken')}</dt>
                <dd>{metrics?.firstContentMs == null ? t('us.notProvided') : ms(metrics.firstContentMs)}</dd>
                <dt>{t('us.ttft')}</dt>
                <dd>{metrics?.ttftMs == null ? t('us.notProvided') : ms(metrics.ttftMs)}</dd>
                <dt>{t('us.cache')}</dt>
                <dd>{metrics?.cacheHitRate == null ? t('us.notProvided') : num(metrics.cacheHitRate * 100, '%')}</dd>
                <dt>{t('us.requests')}</dt>
                <dd>
                  {num(metrics?.sampledRequests)} · {metrics?.metricsComplete ? '完整' : t('us.incomplete')}
                </dd>
                <dt>{t('us.queueWait')}</dt>
                <dd>{ms(metrics?.queueWaitMs)}</dd>
                <dt>{t('us.approvalWait')}</dt>
                <dd>{ms(metrics?.approvalWaitMs)}</dd>
                <dt>{t('us.nativeDuration')}</dt>
                <dd>{ms(metrics?.nativeTiming?.durationMs)}</dd>
                <dt>{t('us.nativeApi')}</dt>
                <dd>{ms(metrics?.nativeTiming?.apiDurationMs)}</dd>
                <dt>{t('us.retries')}</dt>
                <dd>
                  {metrics?.retries?.length
                    ? metrics.retries.map((sample) => `#${sample.attempt} ${ms(sample.delayMs)}`).join(' · ')
                    : t('us.noRetry')}
                </dd>
              </dl>
              {metrics?.requests?.length ? (
                <div className="raw">
                  {metrics.requests
                    .map(
                      (request) =>
                        `${request.requestId.slice(0, 8)} · ${request.role === 'main' ? '主请求' : '子请求'} · 输出 ${num(request.outputTokens)} / ${ms(request.outputDurationMs)}`,
                    )
                    .join('\n')}
                </div>
              ) : null}
              {metrics?.nativeTiming?.modelUsage ? (
                <details className="usage-details" style={{ borderTop: 0, paddingTop: 2 }}>
                  <summary>原生模型分项用量</summary>
                  <pre className="raw">{JSON.stringify(metrics.nativeTiming.modelUsage, null, 2)}</pre>
                </details>
              ) : null}
              {metrics?.toolTimes && Object.keys(metrics.toolTimes).length > 0 ? (
                <details className="usage-details" style={{ borderTop: 0, paddingTop: 2 }}>
                  <summary>工具原生耗时（{Object.keys(metrics.toolTimes).length} 项）</summary>
                  <pre className="raw">
                    {Object.entries(metrics.toolTimes)
                      .map(([toolUseId, duration]) => `${toolUseId} · ${ms(duration)}`)
                      .join('\n')}
                  </pre>
                </details>
              ) : null}
              <p className="usage-foot">{t('us.streamNote')}</p>
            </details>
            {onOpenDetails && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ width: '100%', marginTop: 8, fontSize: 11.5 }}
                onClick={() => onOpenDetails('context')}
              >
                在伴侣面板查看详细诊断与任务 →
              </button>
            )}
          </div>
        )}
      </Menu>
    </div>
  )
}
