import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconWarn, IconShield } from './Icon'
import Markdown from './Markdown'
import { currentTurn } from '../render/blocks'
import DiffView from './DiffView'

interface Props {
  onResolve: (requestId: string, allow: boolean, always?: boolean) => void
}

/** 危险命令模式(命令解释 + 高危标红) */
const DANGEROUS = /\b(rm\s+-rf|del\s+\/[sq]|format|mkfs|shutdown|reboot|git\s+push\s+--force|git\s+reset\s+--hard|DROP\s+TABLE|truncate\s+table)\b/i

const TOOL_LABEL: Record<string, string> = {
  Edit: '修改文件',
  Write: '写入文件',
  MultiEdit: '批量修改',
  Bash: '执行命令',
  WebFetch: '访问网页',
  ExitPlanMode: '计划待采纳',
}

export default function PermissionCard({ onResolve }: Props) {
  const permissions = useStore((s) => s.permissions)
  useLocale()
  const baselines = useStore((s) => s.fileBaselines)
  const entries = useStore((s) => s.entries)
  const currentText =
    currentTurn(entries)
      ?.blocks.filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .join('\n') ?? ''
  const permission = permissions[permissions.length - 1]
  if (!permission) return null

  const command = typeof permission.input.command === 'string' ? permission.input.command : null
  const file = typeof permission.input.file_path === 'string' ? permission.input.file_path : null
  const oldStr = typeof permission.input.old_string === 'string' ? permission.input.old_string : null
  const newStr = typeof permission.input.new_string === 'string' ? permission.input.new_string : null
  const isEdit = oldStr != null && newStr != null
  const dangerous = command != null && DANGEROUS.test(command)
  const isPlan = permission.toolName === 'ExitPlanMode'
  const label = TOOL_LABEL[permission.toolName] ?? permission.toolName

  return (
    <div className={`permission-card ${dangerous ? 'danger' : ''}`} role="group" aria-label={t('pm.title')}>
      <div className="permission-head">
        <span className="permission-icon">
          {dangerous ? <IconWarn width={13} height={13} /> : <IconShield width={13} height={13} />}
        </span>
        <strong>{permission.title ?? (dangerous ? t('pm.danger') : isPlan ? '计划等待采纳' : t('pm.title'))}</strong>
        <span className="badge" style={{ marginLeft: 'auto' }}>
          {label}
        </span>
      </div>

      <div className="permission-body">
        {permission.description && <p>{permission.description}</p>}

        {isPlan &&
          (permission.plan?.trim() ? (
            currentText.includes(permission.plan.trim()) ? (
              <p>计划已在上方正文展示，请核对后采纳。</p>
            ) : (
              <section aria-label="待采纳计划" style={{ fontSize: 13 }}>
                <Markdown text={permission.plan} />
              </section>
            )
          ) : (
            <p>尚未收到可审查的计划正文。可以继续修改计划，或直接停止。</p>
          ))}

        {file && (
          <p className="permission-file" title={file}>
            文件：{file}
          </p>
        )}

        {command && <pre className="permission-command">{command}</pre>}

        {permission.toolName === 'Write' && typeof permission.input.content === 'string' && (
          <>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-faint)' }}>
              {baselines[permission.requestId]?.existed === false
                ? '新建文件，下面是待写入内容'
                : baselines[permission.requestId]?.existed === true
                  ? '写入前的原文件与待执行内容'
                  : '原文件基线未知，仅展示待写入正文'}
            </p>
            <DiffView oldStr={baselines[permission.requestId]?.content ?? ''} newStr={permission.input.content} />
          </>
        )}

        {permission.toolName === 'MultiEdit' &&
          Array.isArray(permission.input.edits) &&
          permission.input.edits.map((edit: Record<string, unknown>, index: number) => (
            <DiffView key={index} oldStr={String(edit.old_string ?? '')} newStr={String(edit.new_string ?? '')} />
          ))}

        {isEdit && <DiffView oldStr={oldStr} newStr={newStr} />}

        {!isPlan && !command && !isEdit && !file && permission.toolName !== 'Write' && permission.toolName !== 'MultiEdit' && (
          <pre className="permission-command" style={{ maxHeight: 160, overflow: 'auto' }}>
            {JSON.stringify(permission.input, null, 2)}
          </pre>
        )}
      </div>

      <div className="permission-actions">
        <span className="hint">{dangerous ? '这条命令可能不可逆，请确认后再允许。' : t('pm.confirm')}</span>
        <button className="btn btn-sm" onClick={() => onResolve(permission.requestId, false)}>
          {isPlan ? '继续修改计划' : t('pm.deny')}
        </button>
        <button
          className="btn btn-sm btn-primary"
          disabled={isPlan && !permission.plan?.trim()}
          onClick={() => onResolve(permission.requestId, true)}
        >
          {isPlan ? '采纳并开始执行' : t('pm.allow')}
        </button>
      </div>
    </div>
  )
}
