import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconChevron, IconCopy, IconFile, IconFolder, IconSearch, IconX, IconCheck } from './Icon'
import DrawerResizer from './DrawerResizer'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

interface Props {
  onClose: () => void
  onSwitchToChanges?: () => void
  onSwitchToPlan?: () => void
  onSwitchToDetails?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes
  const result: TreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      const filteredChildren = filterTree(node.children ?? [], q)
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        result.push({ ...node, children: filteredChildren })
      }
    } else if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
      result.push(node)
    }
  }
  return result
}

function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onSelectFile,
  activePath,
  onInsertMention,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelectFile: (path: string) => void
  activePath?: string | null
  onInsertMention: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isOpen = expanded.has(node.path)
  const isSelected = activePath === node.path

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row ${isSelected ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        onClick={() => {
          if (isDir) onToggle(node.path)
          else onSelectFile(node.path)
        }}
        title={node.path}
      >
        <span className="file-tree-chevron" aria-hidden="true">
          {isDir ? (
            <IconChevron width={10} height={10} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
          ) : (
            <span style={{ width: 10, display: 'inline-block' }} />
          )}
        </span>
        <span className="file-tree-icon">
          {isDir ? <IconFolder width={13} height={13} /> : <IconFile width={13} height={13} />}
        </span>
        <span className="file-tree-name">{node.name}</span>
        {!isDir && (
          <button
            type="button"
            className="file-tree-mention-pill"
            title={t('dw.filesInsertMention')}
            onClick={(e) => {
              e.stopPropagation()
              onInsertMention(node.path)
            }}
          >
            +@
          </button>
        )}
      </div>
      {isDir && isOpen && node.children && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              activePath={activePath}
              onInsertMention={onInsertMention}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilesPanel({
  onClose,
  onSwitchToChanges,
  onSwitchToPlan,
  onSwitchToDetails,
}: Props) {
  useLocale()
  const workspace = useStore((s) => s.settings?.workspace)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [filterQuery, setFilterQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 加载目录树
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/workspaces/tree')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; tree?: TreeNode[] } | null) => {
        if (cancelled) return
        if (data?.ok && Array.isArray(data.tree)) {
          setTree(data.tree)
          // 默认展开一级目录
          const initial = new Set<string>()
          for (const item of data.tree) {
            if (item.type === 'directory') initial.add(item.path)
          }
          setExpanded(initial)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspace])

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // 选定文件查看代码预览
  const handleSelectFile = async (filePath: string) => {
    setActiveFile(filePath)
    setContentLoading(true)
    setContentError(null)
    setFileContent(null)
    try {
      const res = await fetch('/api/workspaces/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      })
      const data = (await res.json()) as { ok: boolean; content?: string; error?: string }
      if (data.ok && typeof data.content === 'string') {
        setFileContent(data.content)
      } else {
        setContentError(data.error || '无法预览此文件')
      }
    } catch {
      setContentError('读取文件发生网络异常')
    } finally {
      setContentLoading(false)
    }
  }

  const handleInsertMention = (path: string) => {
    window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: `@${path} ` }))
  }

  const handleQuoteCode = () => {
    if (!activeFile) return
    const selection = window.getSelection()?.toString()?.trim()
    if (selection) {
      const ext = activeFile.split('.').pop() ?? ''
      const snippet = `\`\`\`${ext}\n// 来自 ${activeFile}\n${selection}\n\`\`\``
      window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: snippet }))
    } else {
      window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: `@${activeFile} ` }))
    }
  }

  const handleCopyContent = () => {
    if (fileContent == null) return
    try {
      navigator.clipboard?.writeText(fileContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const handleRevealInExplorer = async () => {
    if (!activeFile) return
    try {
      await fetch('/api/workspaces/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile }),
      })
    } catch {
      // ignore
    }
  }

  const filteredTree = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return filterTree(tree, q)
  }, [tree, filterQuery])

  const fileStats = useMemo(() => {
    if (fileContent == null) return null
    const lines = fileContent.split('\n').length
    const bytes = new Blob([fileContent]).size
    const ext = activeFile?.split('.').pop()?.toUpperCase() ?? 'FILE'
    return { lines, bytes: formatBytes(bytes), ext }
  }, [fileContent, activeFile])

  return (
    <aside className="drawer" aria-label={t('dw.filesTitle')}>
      <DrawerResizer />
      <header className="drawer-head">
        <div className="drawer-nav-tabs">
          {onSwitchToChanges && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToChanges}>
              {t('dw.tabReview')}
            </button>
          )}
          <button type="button" className="drawer-nav-tab is-active">
            {t('dw.tabFiles')}
          </button>
          {onSwitchToPlan && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToPlan}>
              计划
            </button>
          )}
          {onSwitchToDetails && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToDetails}>
              {t('dw.tabTasks')}
            </button>
          )}
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={onClose} aria-label={t('dw.close')} title={`${t('dw.close')} (Esc)`}>
            <IconX width={16} height={16} />
          </button>
        </div>
      </header>

      <div className="drawer-body files-drawer-body">
        {activeFile ? (
          <div className="file-preview-container animate-fade-in">
            <div className="file-preview-bar">
              <button
                type="button"
                className="btn btn-sm btn-ghost file-preview-back"
                onClick={() => setActiveFile(null)}
                title={t('dw.filesBackToTree')}
              >
                ← {t('dw.filesBackToTree')}
              </button>
              <span className="file-preview-path" title={activeFile}>
                {activeFile}
              </span>
              {fileStats && (
                <span className="file-preview-meta" title={`${fileStats.lines} 行 · ${fileStats.bytes}`}>
                  <span className="meta-tag">{fileStats.ext}</span>
                  <span className="meta-text">{fileStats.lines} 行</span>
                  <span className="meta-sep">·</span>
                  <span className="meta-text">{fileStats.bytes}</span>
                </span>
              )}
              <div className="file-preview-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={handleRevealInExplorer}
                  title="在系统资源管理器中定位此文件"
                >
                  <IconFolder width={13} height={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={handleCopyContent}
                  title="复制代码内容"
                >
                  {copied ? <IconCheck width={13} height={13} style={{ color: 'var(--color-ok)' }} /> : <IconCopy width={13} height={13} />}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleQuoteCode}
                  title="引用当前选中的代码片段或文件路径到输入框"
                >
                  引用到对话
                </button>
              </div>
            </div>

            {contentLoading ? (
              <div className="menu-empty" style={{ padding: '40px 16px' }}>
                <span className="ws-spinner" style={{ marginRight: 8 }} />
                正在加载源码…
              </div>
            ) : contentError ? (
              <div className="note warn" style={{ margin: 16 }}>
                <strong>无法预览文件</strong>
                <div>{contentError}</div>
              </div>
            ) : fileContent != null ? (
              <div className="file-preview-code">
                <table className="code-table">
                  <tbody>
                    {fileContent.split('\n').map((line, idx) => (
                      <tr key={idx}>
                        <td className="code-line-num" aria-hidden="true">
                          {idx + 1}
                        </td>
                        <td className="code-line-text">
                          <code>{line || ' '}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="file-tree-container">
            <div className="file-tree-filter-wrap">
              <IconSearch width={13} height={13} className="file-tree-search-icon" />
              <input
                className="input file-tree-filter-input"
                placeholder="筛选工作区文件…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
              {filterQuery && (
                <button type="button" className="icon-btn" onClick={() => setFilterQuery('')} title="清除筛选">
                  <IconX width={11} height={11} />
                </button>
              )}
            </div>

            {loading ? (
              <div className="menu-empty" style={{ padding: '40px 16px' }}>
                <span className="ws-spinner" style={{ marginRight: 8 }} />
                {t('dw.filesLoading')}
              </div>
            ) : filteredTree.length === 0 ? (
              <p className="menu-empty" style={{ padding: '30px 16px' }}>
                {filterQuery ? '未找到匹配的文件' : t('dw.filesEmpty')}
              </p>
            ) : (
              <div className="file-tree-list">
                {filteredTree.map((item) => (
                  <TreeItem
                    key={item.path}
                    node={item}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggleFolder}
                    onSelectFile={handleSelectFile}
                    activePath={activeFile}
                    onInsertMention={handleInsertMention}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
