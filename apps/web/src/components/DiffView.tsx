import { useMemo } from 'react'
import { diffLines } from 'diff'

/** 行级 diff 共享视图:删除红 / 新增绿(PermissionCard EditDiff 与 ToolCard 变更预览共用) */
export default function DiffView({
  oldStr,
  newStr,
  className = '',
}: {
  oldStr: string
  newStr: string
  className?: string
}) {
  const parts = useMemo(() => diffLines(oldStr, newStr), [oldStr, newStr])
  return (
    <pre
      className={`max-h-56 overflow-auto rounded-lg border border-border bg-bg font-mono text-xs leading-relaxed ${className}`}
    >
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? 'block bg-ok/10 px-3 text-ok'
              : part.removed
                ? 'block bg-danger/10 px-3 text-danger line-through decoration-danger/40'
                : 'block px-3 text-text-faint'
          }
        >
          {part.value.replace(/\n$/, '')}
        </span>
      ))}
    </pre>
  )
}
