import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'
import { t } from '../i18n'

interface SplitRow {
  left?: {
    lineNum?: number
    type: 'del' | 'context'
    text: string
  }
  right?: {
    lineNum?: number
    type: 'add' | 'context'
    text: string
  }
}

function buildSplitRows(parts: Change[]): SplitRow[] {
  const rows: SplitRow[] = []
  let leftLine = 1
  let rightLine = 1

  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (!part) {
      i++
      continue
    }
    const lines = part.value.replace(/\n$/, '').split('\n')

    if (part.added) {
      for (const line of lines) {
        rows.push({
          right: { lineNum: rightLine++, type: 'add', text: line },
        })
      }
      i++
    } else if (part.removed) {
      const nextPart = parts[i + 1]
      if (nextPart && nextPart.added) {
        const addedLines = nextPart.value.replace(/\n$/, '').split('\n')
        const maxLen = Math.max(lines.length, addedLines.length)
        for (let j = 0; j < maxLen; j++) {
          const lText = lines[j]
          const rText = addedLines[j]
          rows.push({
            left: lText !== undefined ? { lineNum: leftLine++, type: 'del', text: lText } : undefined,
            right: rText !== undefined ? { lineNum: rightLine++, type: 'add', text: rText } : undefined,
          })
        }
        i += 2
      } else {
        for (const line of lines) {
          rows.push({
            left: { lineNum: leftLine++, type: 'del', text: line },
          })
        }
        i++
      }
    } else {
      for (const line of lines) {
        rows.push({
          left: { lineNum: leftLine++, type: 'context', text: line },
          right: { lineNum: rightLine++, type: 'context', text: line },
        })
      }
      i++
    }
  }
  return rows
}

/** 行级 diff 共享视图: 支持 unified (单列) 与 split (并排双列) */
export default function DiffView({
  oldStr,
  newStr,
  className = '',
  disk = false,
  mode = 'unified',
}: {
  oldStr: string
  newStr: string
  className?: string
  disk?: boolean
  mode?: 'unified' | 'split'
}) {
  const parts = useMemo(
    () =>
      disk
        ? diffLines(oldStr, newStr, { timeout: 100, maxEditLength: 2000 })
        : diffLines(oldStr, newStr),
    [oldStr, newStr, disk],
  )

  const splitRows = useMemo(() => {
    if (mode !== 'split' || !parts) return []
    return buildSplitRows(parts)
  }, [parts, mode])

  if (!parts) return <p className="menu-empty">{t('dw.diffTooComplex')}</p>

  if (mode === 'split') {
    return (
      <div
        className={`diff-view diff-view-split ${className}`}
        role="group"
        aria-label={disk ? `${t('dw.diskDiff')} (并排)` : '变更预览 (并排)'}
      >
        <div className="diff-split-header">
          <div className="diff-split-header-col left">原始文件 (修改前)</div>
          <div className="diff-split-header-col right">最新内容 (修改后)</div>
        </div>
        <div className="diff-split-body">
          {splitRows.map((row, idx) => (
            <div key={idx} className="diff-split-row">
              {/* 左侧 (原始) */}
              <div className={`diff-split-cell left ${row.left ? row.left.type : 'empty'}`}>
                <span className="diff-split-ln" aria-hidden="true">
                  {row.left?.lineNum ?? ''}
                </span>
                <span className="diff-split-sign" aria-hidden="true">
                  {row.left?.type === 'del' ? '-' : ' '}
                </span>
                <span className="diff-split-code">{row.left?.text ?? ''}</span>
              </div>
              {/* 分割线 */}
              <div className="diff-split-divider" aria-hidden="true" />
              {/* 右侧 (修改后) */}
              <div className={`diff-split-cell right ${row.right ? row.right.type : 'empty'}`}>
                <span className="diff-split-ln" aria-hidden="true">
                  {row.right?.lineNum ?? ''}
                </span>
                <span className="diff-split-sign" aria-hidden="true">
                  {row.right?.type === 'add' ? '+' : ' '}
                </span>
                <span className="diff-split-code">{row.right?.text ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

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
