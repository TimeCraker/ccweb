import { useMemo } from 'react'
import { useStore } from '../store'
import type { ToolBlock } from '../render/blocks'
import DiffView from './DiffView'
export default function ChangesReview({ onClose }: { onClose: () => void }) {
  const entries = useStore(s => s.entries)
  const tools = useMemo(() => entries.flatMap(e => e.type === 'turn' ? e.blocks.filter((b): b is ToolBlock => b.kind === 'tool') : []), [entries])
  const changes = tools.filter(b => ['Edit', 'Write', 'MultiEdit'].includes(b.toolName))
  const checks = tools.filter(b => ['Bash', 'PowerShell'].includes(b.toolName))
  return <section className="changes-review" aria-label="文件改动审查"><header><div><h2>会话改动与检查记录</h2><p>仅展示可关联到工具调用的记录；工作区其他改动不自动归为 Agent 修改。</p></div><button onClick={onClose}>返回对话</button></header>
    <h3>文件改动</h3>{changes.length ? changes.map(b => <article key={b.toolUseId}><h4>{String(b.input?.file_path ?? b.toolName)} <small>{b.status}</small></h4>{b.status !== 'done' && <p>此工具尚未确认成功，以下为请求的修改内容。</p>}{(b.toolName === 'MultiEdit' && Array.isArray(b.input?.edits) ? b.input.edits : [b.input ?? {}]).map((edit: Record<string, unknown>, index: number) => <DiffView key={index} oldStr={String(edit.old_string ?? '')} newStr={String(edit.new_string ?? edit.content ?? '')} />)}</article>) : <p>尚无文件改动记录。</p>}
    <h3>实际工具检查记录</h3><p>模型报告完成不等于验收通过。工具输出可供复核，缺少明确检查证据时仍为未验证。</p>{checks.length ? checks.map(b => <details key={b.toolUseId}><summary>{String(b.input?.command ?? b.toolName)} · {b.status}</summary><pre>{b.resultText ?? '尚无工具返回结果'}</pre></details>) : <p>未记录检查。</p>}
  </section>
}
