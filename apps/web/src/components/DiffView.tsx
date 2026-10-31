import { useMemo } from 'react'
import { diffLines } from 'diff'

/** 行级 diff 共享视图:删除红 / 新增绿(审批卡与工具卡变更预览共用) */
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
    <div className={`diff-view ${className}`} role="group" aria-label="变更预览">
      {parts.map((part, index) => (
        <div
          key={index}
          className={`diff-line ${part.added ? 'add' : part.removed ? 'del' : 'context'}`}
        >
          <span aria-hidden="true">{part.added ? '+ ' : part.removed ? '- ' : '  '}</span>
          {part.value.replace(/\n$/, '')}
        </div>
      ))}
    </div>
  )
}
