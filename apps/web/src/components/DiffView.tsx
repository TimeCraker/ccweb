import { useMemo } from 'react'
import { diffLines } from 'diff'
import { t } from '../i18n'

/** 行级 diff 共享视图:删除红 / 新增绿(审批卡与工具卡变更预览共用) */
export default function DiffView({
  oldStr,
  newStr,
  className = '',
  disk = false,
}: {
  oldStr: string
  newStr: string
  className?: string
  disk?: boolean
}) {
  const parts = useMemo(() => disk
    ? diffLines(oldStr, newStr, { timeout: 100, maxEditLength: 2000 })
    : diffLines(oldStr, newStr), [oldStr, newStr, disk])
  if (!parts) return <p className="menu-empty">{t('dw.diffTooComplex')}</p>
  return (
    <div className={`diff-view ${className}`} role="group" aria-label={disk ? t('dw.diskDiff') : '变更预览'}>
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
