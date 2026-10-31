import { contextUsage } from '../context-usage'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { Menu } from './ui/Menu'
import { IconChevron } from './Icon'

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
export default function UsageBar() {
  const metrics = useStore((s) => s.metrics)
  const busy = useStore((s) => s.busy)
  const context = useStore((s) => s.context)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const percentage = contextUsage(context?.raw)?.percentage ?? null
  const duration = metrics?.runStartedAt ? Math.max(0, ((metrics.completedAt ?? now) - metrics.runStartedAt) / 1000) : null
  const speed = metrics?.tokensPerSecond ?? null
  const hasData =
    speed != null ||
    duration != null ||
    percentage != null ||
    (metrics?.inputTokens ?? 0) > 0 ||
    (metrics?.outputTokens ?? 0) > 0
  if (!hasData) return null

  const failed = metrics?.terminalStatus === 'failed'
  const cancelled = metrics?.terminalStatus === 'cancelled'
  // 输入/输出在运行时口径里是会话累计,始终按"本次对话"标注,不伪装成本轮
  const scope = t('us.session')

  return (
    <div className="usage" aria-label={t('us.title')}>
      {speed != null && (
        <span className="usage-item">
          {metrics?.speedScope === 'turn' ? '本轮均速' : '最近请求'} <b>{num(speed)} tok/s</b>
        </span>
      )}
      {duration != null && (
        <span className="usage-item">
          {failed ? '本轮失败于' : cancelled ? '本轮已取消于' : t('us.elapsed')} <b>{num(duration, 's')}</b>
        </span>
      )}
      {percentage != null && (
        <span className="usage-item">
          {t('us.context')} <b>{num(percentage, '%')}</b>
        </span>
      )}
      <Menu
        label={t('us.title')}
        align="end"
        width={316}
        trigger={({ open }) => (
          <button className="usage-trigger" aria-expanded={open}>
            {t('us.title')}
            <IconChevron
              width={11}
              height={11}
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
              <p className="usage-foot">{t('us.streamNote')}</p>
            </details>
          </div>
        )}
      </Menu>
    </div>
  )
}
