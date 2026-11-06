import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import type { ToolBlock } from '../render/blocks'
import type { FileBaseline } from '../types'
import { compactPath } from '../lib/path'
import DiffView from './DiffView'
import { IconCheck, IconChevron, IconWarn, IconX } from './Icon'

function FileChange({ block, baseline }: { block: ToolBlock; baseline?: FileBaseline }) {
  const [open, setOpen] = useState(false)
  const file = String(block.input?.file_path ?? block.toolName)
  const disk = block.status === 'done' ? baseline?.observed : undefined
  const requested = block.toolName === 'MultiEdit' && Array.isArray(block.input?.edits)
    ? block.input.edits : [block.input ?? {}]
  return (
    <details className="change-file" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {block.status === 'error' ? (
          <IconWarn width={13} height={13} style={{ color: 'var(--color-danger)', flex: '0 0 auto' }} />
        ) : (
          <IconCheck width={13} height={13} style={{ color: block.status === 'done' ? 'var(--color-ok)' : 'var(--color-text-faint)', flex: '0 0 auto' }} />
        )}
        <span className="path" title={file}>{compactPath(file, 30)}</span>
        <span className="badge">{block.toolName}</span>
        <span className="badge">{t(disk ? 'dw.diskDiff' : 'dw.requestPreview')}</span>
        <IconChevron width={13} height={13} className="change-file-chevron" />
      </summary>
      {open && (
        <div className="diff-wrap">
          <p className="change-file-note">{t(disk ? 'dw.snapshotScope' : 'dw.noSnapshot')}</p>
          {disk ? (
            (disk.before ?? '') === (disk.after ?? '') ? (
              <p className="menu-empty">{t(disk.before === disk.after ? 'dw.noDiskChange'
                : disk.before === null ? 'dw.emptyFileCreated' : 'dw.emptyFileRemoved')}</p>
            ) : (
              <DiffView oldStr={disk.before ?? ''} newStr={disk.after ?? ''} disk />
            )
          ) : requested.map((edit: unknown, index: number) => {
            const record = (edit ?? {}) as Record<string, unknown>
            return (
              <DiffView
                key={index}
                oldStr={block.toolName === 'Write' ? baseline?.content ?? '' : String(record.old_string ?? '')}
                newStr={String(record.new_string ?? record.content ?? '')}
              />
            )
          })}
        </div>
      )}
    </details>
  )
}

/** 右侧「本次改动」面板:仅展示可关联到工具调用的记录,保留主对话与滚动位置。 */
export default function ChangesPanel({ onClose, onSwitchToDetails }: { onClose: () => void; onSwitchToDetails?: () => void }) {
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
        <div className="drawer-nav-tabs">
          <button type="button" className="drawer-nav-tab is-active">
            Review {changedFiles.size > 0 && <span className="tab-badge">{changedFiles.size}</span>}
          </button>
          {onSwitchToDetails && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToDetails}>
              Tasks & Details
            </button>
          )}
        </div>
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
          {changes.map((block) => <FileChange key={block.toolUseId} block={block} baseline={baselines[block.toolUseId]} />)}
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
          {t('dw.reviewScope')}
        </p>
      </div>
    </aside>
  )
}
