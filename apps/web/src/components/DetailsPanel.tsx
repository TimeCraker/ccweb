import { useMemo, useState } from 'react'
import { contextUsage } from '../context-usage'
import { useStore } from '../store'
import { t, tf } from '../i18n'
import type { ToolBlock } from '../render/blocks'
import { IconCopy, IconX } from './Icon'
import { copyText } from '../clipboard'
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
              <div
                style={{
                  padding: '16px',
                  background: 'var(--color-panel-2)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>运行准备就绪</span>
                  <span className="dot ok" style={{ width: 6, height: 6 }} />
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--color-text-dim)', lineHeight: 1.5, margin: 0 }}>
                  对话启动后将在此处实时呈现上下文 Token 水位、命中率与实时费用。
                </p>
              </div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3>{t('ctx.total')}</h3>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: 11, height: 22, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={async () => {
                      const lines = [
                        `Token 输入: ${fmtTokens(metrics.inputTokens)}`,
                        `Token 输出: ${fmtTokens(metrics.outputTokens)}`,
                        `预估消耗: ${money(metrics.totalCostUsd)}`,
                      ]
                      if (level) lines.unshift(`水位: ${pct.toFixed(0)}% (${fmtTokens(level.used)} / ${fmtTokens(level.max)})`)
                      await copyText(lines.join('\n'))
                      useStore.getState().setNotice('已复制运行用量数据')
                    }}
                    title="复制用量数据"
                  >
                    <IconCopy width={11} height={11} />
                    <span>复制摘要</span>
                  </button>
                </div>
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

            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ flex: 1, fontSize: 11, height: 26 }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: '/compact' }))
                  useStore.getState().setNotice('已将 /compact 注入输入框')
                }}
                title="压缩当前会话上下文并保留关键信息"
              >
                /compact 压缩上下文
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ flex: 1, fontSize: 11, height: 26 }}
                onClick={() => {
                  useStore.getState().clearView()
                  useStore.getState().setNotice('已清空当前屏幕')
                }}
                title="清空当前屏幕消息 (保留后台上下文)"
              >
                清空屏幕
              </button>
            </div>
          </>
        )}

        {tab === 'trajectory' && (
          <section className="drawer-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-faint)' }}>按时间记录工具调用流水</span>
              {trajectory.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, height: 22, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={async () => {
                    const txt = trajectory.map((item, idx) => `${idx + 1}. [${item.status}] ${item.toolName} - ${item.summary}`).join('\n')
                    await copyText(txt)
                    useStore.getState().setNotice('已复制工具调用流水账')
                  }}
                  title="复制全部调用记录"
                >
                  <IconCopy width={11} height={11} />
                  <span>复制流水</span>
                </button>
              )}
            </div>
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: 12, fontWeight: 550 }}>{item.toolName}</strong>
                        <span style={{ fontSize: 10.5, color: item.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>
                          {item.status === 'error' ? '失败' : item.status === 'done' ? '成功' : '执行中'}
                        </span>
                      </div>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--color-text-faint)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 2,
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

        <details className="raw-details" style={{ marginTop: 24, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-text-faint)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>高级排障与检查点文件回退</span>
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
