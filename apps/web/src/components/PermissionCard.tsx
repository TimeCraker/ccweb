import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconWarn } from './Icon'
import Markdown from './Markdown'
import { currentTurn } from '../render/blocks'
import DiffView from './DiffView'

interface Props {
  onResolve: (requestId: string, allow: boolean, always?: boolean) => void
}

/** 危险命令模式(命令解释 + 高危标红) */
const DANGEROUS = /\b(rm\s+-rf|del\s+\/[sq]|format|mkfs|shutdown|reboot|git\s+push\s+--force|git\s+reset\s+--hard|DROP\s+TABLE|truncate\s+table)\b/i

export default function PermissionCard({ onResolve }: Props) {
  const permissions = useStore((s) => s.permissions)
  useLocale()
  const baselines = useStore(s => s.fileBaselines)
  const entries = useStore(s => s.entries)
  const currentText = currentTurn(entries)?.blocks.filter(b => b.kind === "text").map(b => b.kind === "text" ? b.text : "").join("\n") ?? ""
  const p = permissions[permissions.length - 1]
  if (!p) return null

  const command = typeof p.input.command === 'string' ? p.input.command : null
  const file = typeof p.input.file_path === 'string' ? p.input.file_path : null
  const oldStr = typeof p.input.old_string === 'string' ? p.input.old_string : null
  const newStr = typeof p.input.new_string === 'string' ? p.input.new_string : null
  const isEdit = oldStr != null && newStr != null
  const dangerous = command != null && DANGEROUS.test(command)

  return (
    <div className="permission-dock mx-auto mb-2 max-w-3xl px-6">
      <div
        className={`rounded-xl border p-4 shadow-lg backdrop-blur ${
          dangerous ? 'border-danger/50 bg-danger/5' : 'border-warn/40 bg-panel-2/95'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-md ${dangerous ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'}`}>
            <IconWarn width={14} height={14} />
          </span>
          <span className="text-sm font-medium">{p.title ?? (dangerous ? t('pm.danger') : t('pm.title'))}</span>
          <span className="rounded bg-border px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
            {p.toolName}
          </span>
        </div>

        {p.description && <p className="mt-2 text-sm text-text-dim">{p.description}</p>}
        {p.toolName === 'ExitPlanMode' && (p.plan?.trim() ? (currentText.includes(p.plan.trim()) ? <p>计划已在上方正文展示，请核对后采纳。</p> : <section aria-label="待采纳计划"><Markdown text={p.plan} /></section>) : <p>尚未收到可供审查的计划正文，请继续修改计划或停止。</p>)}
        {file && <p className="mt-2 truncate font-mono text-xs text-text-dim" title={file}>{file}</p>}
        {command && (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text-dim">
            {command}
          </pre>
        )}
        {p.toolName === 'Write' && typeof p.input.content === 'string' && <><p className="mt-2 text-xs">{baselines[p.requestId]?.existed === false ? '新建文件' : baselines[p.requestId]?.existed === true ? '写入前原文件与待执行内容' : '原文件基线未知，仅展示待写入正文'}</p><DiffView oldStr={baselines[p.requestId]?.content ?? ''} newStr={p.input.content} /></>}
        {p.toolName === 'MultiEdit' && Array.isArray(p.input.edits) && p.input.edits.map((edit: Record<string, unknown>, index: number) => <DiffView key={index} oldStr={String(edit.old_string ?? '')} newStr={String(edit.new_string ?? '')} />)}
        {isEdit && <DiffView oldStr={oldStr} newStr={newStr} className="mt-3" />}
        {p.toolName !== 'ExitPlanMode' && !command && !isEdit && !file && (
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text-dim">
            {JSON.stringify(p.input, null, 2)}
          </pre>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-text-faint">{t('pm.confirm')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onResolve(p.requestId, false)}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-danger hover:text-danger"
            >
              {p.toolName === 'ExitPlanMode' ? '继续修改计划' : t('pm.deny')}
            </button>
            <button
              disabled={p.toolName === 'ExitPlanMode' && !p.plan?.trim()}
              onClick={() => onResolve(p.requestId, true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {p.toolName === 'ExitPlanMode' ? '采纳并执行（手动审批）' : t('pm.allow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
