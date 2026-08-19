import { useStore } from '../store'

interface Props {
  onResolve: (requestId: string, allow: boolean) => void
}

/** P0 基础审批卡;P1 升级:diff 高亮/命令解释/总是允许 */
export default function PermissionCard({ onResolve }: Props) {
  const permissions = useStore((s) => s.permissions)
  const p = permissions[permissions.length - 1]
  if (!p) return null

  const command = typeof p.input.command === 'string' ? p.input.command : null
  const file =
    typeof p.input.file_path === 'string'
      ? p.input.file_path
      : typeof p.input.path === 'string'
        ? p.input.path
        : null

  return (
    <div className="mx-auto mb-2 max-w-3xl px-6">
      <div className="rounded-xl border border-warn/40 bg-panel-2 p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-warn/15 text-xs text-warn">
            ⚠
          </span>
          <span className="text-sm font-medium">操作需要确认</span>
          <span className="rounded bg-border px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
            {p.toolName}
          </span>
        </div>

        {command && (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text-dim">
            {command}
          </pre>
        )}
        {file && !command && (
          <p className="mt-3 truncate font-mono text-xs text-text-dim" title={file}>
            {file}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => onResolve(p.requestId, false)}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-danger hover:text-danger"
          >
            拒绝
          </button>
          <button
            onClick={() => onResolve(p.requestId, true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
