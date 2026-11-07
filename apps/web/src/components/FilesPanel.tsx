import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconChevron, IconCopy, IconFile, IconFolder, IconSearch, IconX, IconCheck } from './Icon'
import { copyText } from '../clipboard'
import { baseName } from '../lib/path'
import DrawerResizer from './DrawerResizer'
import Markdown from './Markdown'

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

interface FileIconProps {
  name: string
  isDir: boolean
  isOpen?: boolean
}

function FileTreeIcon({ name, isDir, isOpen }: FileIconProps) {
  if (isDir) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#d97706', flexShrink: 0 }}>
        {isOpen ? (
          <>
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" fill="#d97706" fillOpacity="0.18" />
            <path d="m2 10 2.2 9.2A2 2 0 0 0 6.1 21h13.8a2 2 0 0 0 1.9-1.8L23 10H2Z" fill="#d97706" fillOpacity="0.32" />
          </>
        ) : (
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" fill="#d97706" fillOpacity="0.22" />
        )}
      </svg>
    )
  }

  const ext = (name.split('.').pop() || '').toLowerCase()
  const lower = name.toLowerCase()

  // TypeScript / TSX
  if (ext === 'ts' || ext === 'tsx') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#3178c6" />
        <path d="M7 9h6M10 9v9" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        {ext === 'tsx' ? (
          <path d="M14 12l4 6M18 12l-4 6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M14 16.5c.8.6 1.8.8 2.6.4.8-.4 1.1-1.2.7-1.8-.4-.7-2-.9-2.6-1.5-.6-.7-.2-1.8.8-2.3 1-.4 2.1-.2 2.8.4" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    )
  }

  // JavaScript / JSX / MJS / CJS
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#f7df1e" />
        <path d="M8 15c0 2 1.5 2.5 2.8 2.5 1.5 0 2.2-.8 2.2-2.2V9" stroke="#1c1f24" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M14 16.5c.8.6 1.8.8 2.6.4.8-.4 1.1-1.2.7-1.8-.4-.7-2-.9-2.6-1.5-.6-.7-.2-1.8.8-2.3 1-.4 2.1-.2 2.8.4" stroke="#1c1f24" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  // JSON
  if (ext === 'json') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#ea580c" />
        <path d="M9 8c-1 0-1.8.8-1.8 1.8v1.4c0 .8-.6 1.4-1.2 1.8.6.4 1.2 1 1.2 1.8v1.4c0 1 .8 1.8 1.8 1.8M15 8c1 0 1.8.8 1.8 1.8v1.4c0 .8.6 1.4 1.2 1.8-.6.4-1.2 1-1.2 1.8v1.4c0 1-.8 1.8-1.8 1.8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  // Markdown / TXT / Doc
  if (ext === 'md' || ext === 'mdx' || ext === 'txt') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#0284c7" />
        <path d="M6 16V8l3 3.5L12 8v8M18 13l-2.5 3-2.5-3M15.5 8v8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // CSS / SCSS / LESS
  if (ext === 'css' || ext === 'scss' || ext === 'less') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#6366f1" />
        <path d="M8 8h8M8 12h6M8 16h8" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }

  // HTML / SVG / XML
  if (ext === 'html' || ext === 'svg' || ext === 'xml') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#e11d48" />
        <path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 8l-2 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // Images / Media
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico', 'bmp', 'mp4', 'webm', 'mov', 'mp3', 'wav'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#a855f7" />
        <circle cx="8" cy="8" r="1.5" fill="#ffffff" />
        <path d="M4 17l5-5 3 3 4-4 4 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1Z" fill="#ffffff" />
      </svg>
    )
  }

  // Git / Config / Lock / Package
  if (lower.includes('gitignore') || lower.includes('gitattributes')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      </svg>
    )
  }

  if (lower.includes('package') || lower.includes('pnpm') || lower.includes('lock') || ext === 'yaml' || ext === 'yml') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" fill="#10b981" fillOpacity="0.18" />
        <path d="M12 12 4 7.5M12 12v9M12 12l8-4.5" />
      </svg>
    )
  }

  // Default File
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onSelectFile,
  activePath,
  onInsertMention,
  changedFilesSet,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelectFile: (path: string) => void
  activePath?: string | null
  onInsertMention: (path: string) => void
  changedFilesSet: Set<string>
}) {
  const isDir = node.type === 'directory'
  const isOpen = expanded.has(node.path)
  const isSelected = activePath === node.path
  const isChanged = !isDir && (changedFilesSet.has(node.path) || changedFilesSet.has(node.name))

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
          <FileTreeIcon name={node.name} isDir={isDir} isOpen={isOpen} />
        </span>
        <span className="file-tree-name">{node.name}</span>
        {isChanged && <span className="file-git-dot" title="本次会话中已被编辑修改" />}
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
              changedFilesSet={changedFilesSet}
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
  onSwitchToDetails,
}: Props) {
  useLocale()
  const workspace = useStore((s) => s.settings?.workspace)
  const entries = useStore((s) => s.entries)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [filterQuery, setFilterQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const changedFilesSet = useMemo(() => {
    const set = new Set<string>()
    for (const entry of entries) {
      if (entry.type === 'turn') {
        for (const b of entry.blocks) {
          if (b.kind === 'tool' && (b.toolName === 'Edit' || b.toolName === 'Write' || b.toolName === 'MultiEdit')) {
            const fp = String(b.input?.file_path ?? '').replace(/\\/g, '/')
            if (fp) {
              set.add(fp)
              const parts = fp.split('/')
              const name = parts[parts.length - 1]
              if (name) set.add(name)
            }
          }
        }
      }
    }
    return set
  }, [entries])

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

  // 选定文件查看代码预览或多媒体展示
  const activeExt = (activeFile?.split('.').pop() || '').toLowerCase()
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(activeExt)
  const isPdf = activeExt === 'pdf'
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(activeExt)
  const isAudio = ['mp3', 'wav', 'm4a'].includes(activeExt)
  const isDoc = ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'zip', 'tar', 'gz', '7z'].includes(activeExt)
  const isMarkdown = activeExt === 'md' || activeExt === 'markdown'
  const isJson = activeExt === 'json'

  const [viewMode, setViewMode] = useState<'preview' | 'source'>(() => {
    try {
      return localStorage.getItem('ccweb.fileViewMode') === 'source' ? 'source' : 'preview'
    } catch {
      return 'preview'
    }
  })
  const [formatJson, setFormatJson] = useState(true)

  const displayCode = useMemo(() => {
    if (fileContent == null) return null
    if (isJson && formatJson) {
      try {
        return JSON.stringify(JSON.parse(fileContent), null, 2)
      } catch {
        return fileContent
      }
    }
    return fileContent
  }, [fileContent, isJson, formatJson])

  const handleSelectFile = async (filePath: string) => {
    setActiveFile(filePath)
    setContentError(null)
    setFileContent(null)

    const ext = (filePath.split('.').pop() || '').toLowerCase()
    const isBinaryMedia = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'pdf', 'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'm4a', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'zip', 'tar', 'gz', '7z'].includes(ext)

    if (isBinaryMedia) {
      setContentLoading(false)
      return
    }

    setContentLoading(true)
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
    const textToCopy = displayCode ?? fileContent
    if (textToCopy == null) return
    try {
      navigator.clipboard?.writeText(textToCopy)
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

  const handleOpenFileWithDefaultApp = async () => {
    if (!activeFile) return
    try {
      const res = await fetch('/api/workspaces/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (data.ok) {
        useStore.getState().setNotice(`已在系统中打开文件: ${baseName(activeFile)}`)
      } else {
        useStore.getState().setNotice(data.error || '无法打开此文件')
      }
    } catch {
      useStore.getState().setNotice('调用系统程序异常')
    }
  }

  const filteredTree = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return filterTree(tree, q)
  }, [tree, filterQuery])

  const fileStats = useMemo(() => {
    const ext = activeFile?.split('.').pop()?.toUpperCase() ?? 'FILE'
    if (fileContent == null) return { lines: 0, bytes: '', ext }
    const lines = fileContent.split('\n').length
    const bytes = new Blob([fileContent]).size
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
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, height: 24, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    void copyText(activeFile).then(() => {
                      useStore.getState().setNotice(`已复制相对路径: ${activeFile}`)
                    })
                  }}
                  title="复制相对路径"
                >
                  <IconCopy width={11} height={11} />
                  <span>相对路径</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, height: 24, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    const full = workspace ? `${workspace}/${activeFile}`.replace(/[/\\]+/g, '/') : activeFile
                    void copyText(full).then(() => {
                      useStore.getState().setNotice(`已复制绝对路径: ${full}`)
                    })
                  }}
                  title="复制绝对路径"
                >
                  <IconCopy width={11} height={11} />
                  <span>绝对路径</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={handleCopyContent}
                  title="复制代码内容"
                >
                  {copied ? <IconCheck width={13} height={13} style={{ color: 'var(--color-ok)' }} /> : <IconCopy width={13} height={13} />}
                </button>
                {isMarkdown && fileContent != null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: 11, height: 24, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => {
                      const next = viewMode === 'preview' ? 'source' : 'preview'
                      setViewMode(next)
                      try {
                        localStorage.setItem('ccweb.fileViewMode', next)
                      } catch {
                        /* ignore */
                      }
                    }}
                    title={viewMode === 'preview' ? '切换为带行号的源码查看' : '切换为富文本渲染预览'}
                  >
                    <span>{viewMode === 'preview' ? '查看源码' : '富文本预览'}</span>
                  </button>
                )}
                {isJson && fileContent != null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: 11, height: 24, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => setFormatJson((v) => !v)}
                    title={formatJson ? '查看未格式化原始代码' : '美化缩进排版 (Format)'}
                  >
                    <span>{formatJson ? '原始 JSON' : '格式化'}</span>
                  </button>
                )}
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
                正在加载文件…
              </div>
            ) : contentError ? (
              <div
                className="file-preview-doc-card"
                style={{
                  padding: 32,
                  textAlign: 'center',
                  margin: 16,
                  background: 'var(--color-panel-2)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                }}
              >
                <IconFile width={36} height={36} style={{ margin: '0 auto 12px', color: 'var(--color-warn)' }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{baseName(activeFile)}</div>
                <div style={{ color: 'var(--color-text-faint)', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                  {contentError}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleOpenFileWithDefaultApp}
                  >
                    用系统默认程序打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={handleRevealInExplorer}
                  >
                    在资源管理器中定位
                  </button>
                </div>
              </div>
            ) : isImage && activeFile ? (
              <div
                className="file-preview-media file-preview-image"
                style={{
                  padding: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 320,
                  background: 'var(--color-panel-2)',
                  borderRadius: 8,
                  margin: 16,
                }}
              >
                <img
                  src={`/api/workspaces/raw-file?path=${encodeURIComponent(activeFile)}`}
                  alt={activeFile}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    objectFit: 'contain',
                    borderRadius: 6,
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
              </div>
            ) : isPdf && activeFile ? (
              <div className="file-preview-media file-preview-pdf" style={{ height: '70vh', padding: 12 }}>
                <iframe
                  src={`/api/workspaces/raw-file?path=${encodeURIComponent(activeFile)}`}
                  title={activeFile}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 6 }}
                />
              </div>
            ) : isVideo && activeFile ? (
              <div className="file-preview-media file-preview-video" style={{ padding: 20, textAlign: 'center' }}>
                <video
                  controls
                  src={`/api/workspaces/raw-file?path=${encodeURIComponent(activeFile)}`}
                  style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 6 }}
                />
              </div>
            ) : isAudio && activeFile ? (
              <div className="file-preview-media file-preview-audio" style={{ padding: 36, textAlign: 'center' }}>
                <audio
                  controls
                  src={`/api/workspaces/raw-file?path=${encodeURIComponent(activeFile)}`}
                  style={{ width: '100%' }}
                />
              </div>
            ) : isDoc && activeFile ? (
              <div
                className="file-preview-doc-card"
                style={{
                  padding: 32,
                  textAlign: 'center',
                  margin: 16,
                  background: 'var(--color-panel-2)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                }}
              >
                <IconFile width={36} height={36} style={{ margin: '0 auto 12px', color: 'var(--color-accent)' }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{baseName(activeFile)}</div>
                <div style={{ color: 'var(--color-text-faint)', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                  {activeExt.toUpperCase()} 二进制文件 (建议使用本地关联程序查看)
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleOpenFileWithDefaultApp}
                  >
                    用系统默认程序打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={handleRevealInExplorer}
                  >
                    在资源管理器中定位
                  </button>
                </div>
              </div>
            ) : fileContent != null ? (
              isMarkdown && viewMode === 'preview' ? (
                <div
                  className="file-preview-markdown md"
                  style={{
                    padding: '20px 24px',
                    overflowY: 'auto',
                    maxHeight: '74vh',
                    lineHeight: 1.7,
                  }}
                >
                  <Markdown text={fileContent} />
                </div>
              ) : (
                <div className="file-preview-code">
                  <table className="code-table">
                    <tbody>
                      {(displayCode ?? fileContent).split('\n').map((line, idx) => (
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
              )
            ) : null}
          </div>
        ) : (
          <div className="file-tree-container">
            <div className="file-tree-filter-wrap">
              <div className="file-tree-search-inner">
                <IconSearch width={13} height={13} className="file-tree-search-icon" />
                <input
                  className="file-tree-filter-input"
                  placeholder="筛选工作区文件… (按 Esc 清除)"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setFilterQuery('')
                  }}
                />
                {filterQuery && (
                  <button type="button" className="file-tree-clear-btn" onClick={() => setFilterQuery('')} title="清除筛选 (Esc)">
                    <IconX width={11} height={11} />
                  </button>
                )}
              </div>
              {filterQuery && (
                <span className="file-tree-count-badge">
                  {filteredTree.length} 个结果
                </span>
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
                    changedFilesSet={changedFilesSet}
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
