import { useMemo } from 'react'
import { useStore } from '../store'
import { t, tf } from '../i18n'
import type { ToolBlock } from '../render/blocks'
import DiffView from './DiffView'
import { IconCheck, IconWarn, IconX } from './Icon'

/** 右侧「本次改动」面板:仅展示可关联到工具调用的记录,保留主对话与滚动位置。 */
export default function ChangesPanel({ onClose }: { onClose: () => void }) {
  const baselines = useStore((s) => s.fileBaselines)
  const metrics = useStore((s) => s.metrics)
  const busy = useStore((s) => s.busy)
  const entries = useStore((s) => s.entries)
  const tools = useMemo(
    () =>
      entries.flatMap((entry) =>
        entry.type === 'turn' ? entry.blocks.filter((block): block is ToolBlock => block.kind === 'tool') : [],
      ),
    [entries],
  )
  const changes = tools.filter((block) => ['Edit', 'Write', 'MultiEdit'].includes(block.toolName))
  const checks = tools.filter((block) => ['Bash', 'PowerShell'].includes(block.toolName))
  const changedFiles = new Set(changes.map((block) => String(block.input?.file_path ?? block.toolName)))
  const done = changes.filter((block) => block.status === 'done').length
  const pendingChanges = changes.length - done
  const failedChecks = checks.filter((block) => block.status === 'error').length

  const status = busy
    ? '运行中，结果待定'
    : metrics?.terminalStatus === 'completed'
      ? '本轮已结束'
      : metrics?.terminalStatus === 'failed'
        ? '运行失败'
        : metrics?.terminalStatus === 'cancelled'
          ? '运行已取消'
          : '历史会话，缺少运行终态'

  return (
    <aside className="drawer" aria-label={t('dw.changes')}>
      <header className="drawer-head">
        <h2>{t('dw.changes')}</h2>
        {changes.length > 0 && (
          <span className="badge accent">
            {tf('dw.fileCount', changedFiles.size)}
          </span>
        )}
        <div className="header-actions">
          <button className="icon-btn" onClick={onClose} aria-label={t('dw.close')} title={t('dw.close')}>
            <IconX width={16} height={16} />
          </button>
        </div>
      </header>
      <div className="drawer-body">
        <div className={`note ${failedChecks > 0 ? 'warn' : ''}`} role="status">
          <div>
            <strong>{status}</strong>
            <div style={{ marginTop: 3 }}>
              文件改动 {done}/{changes.length} 次工具确认成功 · 命令记录 {checks.length} 条
              {failedChecks > 0 ? `（${failedChecks} 条失败）` : ''}。命令成功不等于测试通过。
            </div>
          </div>
        </div>

        <p className="change-summary">
          {changes.length > 0
            ? `修改：${[...changedFiles].slice(0, 4).join('、')}${changedFiles.size > 4 ? ' 等' : ''}。`
            : '本次没有文件改动。'}
          {checks.length > 0
            ? `检查：${checks.length} 条命令${failedChecks > 0 ? `，其中 ${failedChecks} 条失败` : '，未记录失败'}。`
            : '没有命令记录。'}
          {pendingChanges > 0 ? `还有 ${pendingChanges} 次改动未确认，未计入结果。` : ''}
        </p>

        <section className="drawer-section">
          <h3>{t('dw.files')}</h3>
          {changes.length === 0 && <p className="menu-empty">{t('dw.noFiles')}</p>}
          {changes.map((block) => {
            const file = String(block.input?.file_path ?? block.toolName)
            return (
              <details className="change-file" key={block.toolUseId}>
                <summary>
                  {block.status === 'error' ? (
                    <IconWarn width={13} height={13} style={{ color: 'var(--color-danger)', flex: '0 0 auto' }} />
                  ) : (
                    <IconCheck
                      width={13}
                      height={13}
                      style={{ color: block.status === 'done' ? 'var(--color-ok)' : 'var(--color-text-faint)', flex: '0 0 auto' }}
                    />
                  )}
                  <span className="path" title={file}>
                    {file}
                  </span>
                  <span className="badge">{block.toolName}</span>
                </summary>
                <div className="diff-wrap">
                  {block.status !== 'done' && (
                    <p style={{ fontSize: 11.5, color: 'var(--color-text-faint)', marginBottom: 6 }}>
                      此操作尚未确认成功，下面是请求的修改内容。
                    </p>
                  )}
                  {block.toolName === 'Write' && baselines[block.toolUseId]?.content == null && (
                    <p style={{ fontSize: 11.5, color: 'var(--color-text-faint)', marginBottom: 6 }}>
                      未记录写入前的原文件内容，只展示待写入正文。
                    </p>
                  )}
                  {(block.toolName === 'MultiEdit' && Array.isArray(block.input?.edits)
                    ? block.input.edits
                    : [block.input ?? {}]
                  ).map((edit: unknown, index: number) => {
                    const record = (edit ?? {}) as Record<string, unknown>
                    return (
                      <DiffView
                        key={index}
                        oldStr={block.toolName === 'Write' ? baselines[block.toolUseId]?.content ?? '' : String(record.old_string ?? '')}
                        newStr={String(record.new_string ?? record.content ?? '')}
                      />
                    )
                  })}
                </div>
              </details>
            )
          })}
        </section>

        <section className="drawer-section">
          <h3>{t('dw.checks')}</h3>
          {checks.length === 0 && <p className="menu-empty">{t('dw.noChecks')}</p>}
          {checks.map((block) => (
            <details className="check-run" key={block.toolUseId}>
              <summary>
                {block.status === 'error' ? (
                  <IconWarn width={13} height={13} style={{ color: 'var(--color-danger)', flex: '0 0 auto' }} />
                ) : (
                  <IconCheck width={13} height={13} style={{ color: 'var(--color-text-faint)', flex: '0 0 auto' }} />
                )}
                <span className="cmd" title={String(block.input?.command ?? '')}>
                  {String(block.input?.command ?? block.toolName)}
                </span>
                <span className="badge">{block.status === 'error' ? '失败' : block.status === 'done' ? '已返回' : '进行中'}</span>
              </summary>
              <pre>{block.resultText ?? '尚无工具返回结果'}</pre>
            </details>
          ))}
        </section>

        <p style={{ marginTop: 14, fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-faint)' }}>
          这里只是工具返回的证据，不代表已独立验证；工作区里原本存在的改动不会计入本次结果。
        </p>
      </div>
    </aside>
  )
}
