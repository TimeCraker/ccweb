import { useMemo, useState } from 'react'
import { contextUsage } from '../context-usage'
import { useStore } from '../store'
import { t, tf } from '../i18n'
import type { ToolBlock } from '../render/blocks'
import { IconX } from './Icon'
import DrawerResizer from './DrawerResizer'

function fmtTokens(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`
  return String(value)
}

function money(value: number | null | undefined): string {
  if (value == null) return '未提供计价'
  if (value === 0) return '$0'
  return `$${value.toFixed(value < 0.01 ? 4 : 3)}`
}

function summaryOf(input: Record<string, unknown> | null): string {
  if (!input) return '…'
  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
    const value = input[key]
    if (typeof value === 'string' && value !== '') return value.length > 64 ? `${value.slice(0, 64)}…` : value
  }
  const first = Object.values(input)[0]
  return first != null ? String(first).slice(0, 64) : '…'
}

function tryParse(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 右侧「运行详情」:上下文水位、调用轨迹、后台任务与文件回退。默认按需打开。 */
export default function DetailsPanel({
  onClose,
  send,
  initialTab = 'context',
  onSwitchToChanges,
  onSwitchToFiles,
  onSwitchToPlan,
}: {
  onClose: () => void
  send?: (message: Record<string, unknown>) => void
  initialTab?: 'context' | 'controls'
  onSwitchToChanges?: () => void
  onSwitchToFiles?: () => void
  onSwitchToPlan?: () => void
}) {
  const [tab, setTab] = useState<'context' | 'trajectory'>(initialTab === 'controls' ? 'trajectory' : initialTab)
  const [checkpoint, setCheckpoint] = useState('')
  const context = useStore((s) => s.context)
  const metrics = useStore((s) => s.metrics)
  const entries = useStore((s) => s.entries)
  const busy = useStore((s) => s.busy)
  const tasks = useStore((s) => s.nativeTasks)
  const checkpoints = useStore((s) => s.checkpoints)
  const rewind = useStore((s) => s.rewind)

  const level = useMemo(() => contextUsage(context?.raw), [context])
  const pct = level ? Math.min(100, (level.used / level.max) * 100) : 0
  const ringColor = pct > 85 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-warn)' : 'var(--color-accent)'
  const circumference = 2 * Math.PI * 24

  const trajectory = useMemo(() => {
    const items: Array<{ id: string; toolName: string; status: ToolBlock['status']; summary: string }> = []
    for (const entry of entries) {
      if (entry.type !== 'turn') continue
      for (const block of entry.blocks) {
        if (block.kind !== 'tool') continue
        items.push({
          id: `${entry.id}:${block.toolUseId}`,
          toolName: block.toolName,
          status: block.status,
          summary: summaryOf(block.input ?? tryParse(block.inputRaw)),
        })
      }
    }
    return items
  }, [entries])

  const composition = metrics
    ? [
        { key: t('ctx.fresh'), value: metrics.inputTokens, color: 'var(--color-accent)' },
        { key: t('ctx.cacheRead'), value: metrics.cacheReadTokens, color: 'var(--color-ok)' },
        { key: t('ctx.cacheWrite'), value: metrics.cacheCreationTokens, color: 'var(--color-warn)' },
      ]
    : []
  const compositionTotal = composition.reduce((sum, item) => sum + item.value, 0)

  return (
    <aside className="drawer" aria-label={t('dw.details')}>
      <DrawerResizer />
      <header className="drawer-head">
        <div className="drawer-nav-tabs">
          {onSwitchToChanges && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToChanges}>
              {t('dw.tabReview')}
            </button>
          )}
          {onSwitchToFiles && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToFiles}>
              {t('dw.tabFiles')}
            </button>
          )}
          {onSwitchToPlan && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToPlan}>
              计划
            </button>
          )}
          <button type="button" className="drawer-nav-tab is-active">
            {t('dw.tabTasks')}
          </button>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={onClose} aria-label={t('dw.close')} title={`${t('dw.close')} (Esc)`}>
            <IconX width={16} height={16} />
          </button>
        </div>
      </header>
      <div className="drawer-body">
        {tasks.filter((t) => t.status === 'running').length > 0 && (
          <div className="note" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>有后台任务正在运行中</span>
            </div>
            {tasks
              .filter((t) => t.status === 'running')
              .map((task) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.description}
                  </span>
                  {send && (
                    <button className="btn btn-sm" onClick={() => send({ t: 'task.stop', taskId: task.id })}>
                      停止
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}

        <div className="drawer-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'context'} onClick={() => setTab('context')}>
            上下文与用量
          </button>
          <button role="tab" aria-selected={tab === 'trajectory'} onClick={() => setTab('trajectory')}>
            调用轨迹 {trajectory.length > 0 && `(${trajectory.length})`}
          </button>
        </div>

        {tab === 'context' && (
          <>
            {level ? (
              <>
                <div className="ring-gauge">
                  <svg viewBox="0 0 60 60" width="64" height="64" style={{ transform: 'rotate(-90deg)', flex: '0 0 auto' }}>
                    <circle cx="30" cy="30" r="24" fill="none" stroke="var(--color-panel-3)" strokeWidth="6" />
                    <circle
                      cx="30"
                      cy="30"
                      r="24"
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - pct / 100)}
                    />
                  </svg>
                  <div className="ring-label">
                    <strong>{pct.toFixed(0)}%</strong>
                    <span>
                      {fmtTokens(level.used)} / {fmtTokens(level.max)} 上下文已用
                    </span>
                  </div>
                </div>
                {pct > 85 && (
                  <div className="note warn" style={{ marginTop: 12 }}>
                    <div>{tf('ctx.warn', Math.round(pct))}</div>
                  </div>
                )}
              </>
            ) : (
              <p className="menu-empty">{t('ctx.waiting')}</p>
            )}

            {compositionTotal > 0 && (
              <section className="drawer-section">
                <h3>{t('ctx.composition')}</h3>
                <div className="bar-meter" style={{ display: 'flex' }}>
                  {composition.map((item) => (
                    <i
                      key={item.key}
                      style={{
                        width: `${(item.value / compositionTotal) * 100}%`,
                        background: item.color,
                        borderRadius: 0,
                      }}
                    />
                  ))}
                </div>
                <dl className="kv-list" style={{ marginTop: 9 }}>
                  {composition.map((item) => (
                    <div key={item.key} style={{ display: 'contents' }}>
                      <dt>{item.key}</dt>
                      <dd>{fmtTokens(item.value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {metrics && (
              <section className="drawer-section">
                <h3>{t('ctx.total')}</h3>
                <dl className="kv-list">
                  <dt>{t('ctx.output')}</dt>
                  <dd>{fmtTokens(metrics.outputTokens)}</dd>
                  <dt>{t('us.cost')}</dt>
                  <dd>{money(metrics.totalCostUsd)}</dd>
                  <dt>{t('us.elapsed')}</dt>
                  <dd>{metrics.runStartedAt && metrics.completedAt ? `${((metrics.completedAt - metrics.runStartedAt) / 1000).toFixed(1)}s` : '运行中'}</dd>
                </dl>
              </section>
            )}
          </>
        )}

        {tab === 'trajectory' && (
          <section className="drawer-section">
            {trajectory.length === 0 ? (
              <p className="menu-empty">{t('ctx.noTrajectory')}</p>
            ) : (
              <ol>
                {trajectory.map((item) => (
                  <li key={item.id} style={{ display: 'flex', gap: 9, paddingBottom: 10 }}>
                    <span
                      className={`dot ${item.status === 'error' ? 'danger' : item.status === 'done' ? 'ok' : 'accent'}`}
                      style={{ marginTop: 6 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550 }}>{item.toolName}</strong>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--color-text-faint)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.summary}
                      >
                        {item.summary}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <details className="raw-details" style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-text-faint)', fontSize: 11.5 }}>
            高级设置与文件回退
          </summary>
          <div style={{ marginTop: 10, padding: 8, background: 'var(--color-panel-2)', borderRadius: 6 }}>
            <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-faint)', marginBottom: 8 }}>
              只回退原生跟踪的文件，不回退对话。先预览，再确认执行。
            </p>
            <label className="field" style={{ display: 'block', marginBottom: 8 }}>
              <select
                aria-label="文件检查点"
                value={checkpoint}
                onChange={(e) => {
                  setCheckpoint(e.target.value)
                  useStore.setState({ rewind: null })
                }}
                style={{ width: '100%', fontSize: 11.5 }}
              >
                <option value="">选择本次连接的用户轮次</option>
                {checkpoints.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.text}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button
                className="btn btn-sm"
                disabled={busy || !checkpoint}
                onClick={() => send?.({ t: 'files.rewind', userMessageId: checkpoint, dryRun: true })}
              >
                预览回退
              </button>
              {rewind?.preview && rewind.result.canRewind && (
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('确认按此检查点回退原生跟踪的文件？这会修改文件；Bash 写入与对话不会回退。')) return
                    send?.({ t: 'files.rewind', userMessageId: checkpoint, dryRun: false })
                  }}
                >
                  确认回退
                </button>
              )}
            </div>
            {rewind && (
              <div className="note" style={{ marginTop: 9 }}>
                <div>
                  <strong>{rewind.preview ? '预览结果' : '执行结果'}</strong>
                  <div style={{ marginTop: 3 }}>
                    {rewind.result.canRewind ? '可回退' : rewind.result.error ?? '不可回退'}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <pre style={{ fontSize: 10 }}>{context ? JSON.stringify(context.raw, null, 2) : '原生运行时尚未提供'}</pre>
          </div>
        </details>
      </div>
    </aside>
  )
}
