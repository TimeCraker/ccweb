import Lightbox from './Lightbox'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useStore, visibleEntries } from '../store'
import { t, useLocale } from '../i18n'
import type { Block, TurnEntry } from '../render/blocks'
import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCard from './ToolCard'
import { copyText } from '../clipboard'
import { IconFork, IconWarn, IconCopy, IconCheck, IconPencil, IconList, IconX, IconChevron } from './Icon'


export interface HeadingItem {
  level: number
  text: string
  id: string
}

export function parseHeadings(markdown: string): HeadingItem[] {
  if (!markdown) return []
  const lines = markdown.split('\n')
  const headings: HeadingItem[] = []
  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim())
    if (match && match[1] && match[2]) {
      const level = match[1].length
      const text = match[2].trim().replace(/[#*`_]/g, '')
      if (text) {
        const id = 'heading-' + encodeURIComponent(text.toLowerCase().replace(/\s+/g, '-'))
        headings.push({ level, text, id })
      }
    }
  }
  return headings
}

function StreamFooterSpacer() {
  return <div className="stream-footer-spacer" style={{ height: 56, pointerEvents: 'none' }} aria-hidden="true" />
}

interface StreamProps {
  onRegenerate?: () => void
  /** Only expose message-level forks when a native UUID is known. */
  onForkFromMessage?: (uuid: string) => void
}

/**
 * 消息流:虚拟滚动 + 钉底跟随(dsh 语义:非钉底不跟随 + 浮动回底按钮)。
 * zustand selector 一律稳定引用(派生放 useMemo,防 React #185)。
 */
export default function MessageStream({ onRegenerate, onForkFromMessage }: StreamProps) {
  const rawEntries = useStore((s) => s.entries)
  const entries = useMemo(() => visibleEntries(rawEntries), [rawEntries])
  const busy = useStore((s) => s.busy)
  const turnStartedAt = useStore((s) => s.turnStartedAt)
  const historyVersion = useStore((s) => s.historyVersion)
  const historyFocus = useStore((s) => s.historyFocus)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)
  const userScrolledUp = useRef(false)
  const lastUserId = useRef<string | undefined>(undefined)
  const range = useRef({ startIndex: 0, endIndex: 0 })
  useLocale()

  const newest = [...entries].reverse().find(entry => entry.type === 'user')?.id
  const entryCount = useRef(entries.length)
  entryCount.current = entries.length
  const jumpedVersion = useRef(-1)

  // 历史/首轮渲染后钉到底部:虚拟列表先按估算高度定位,图片和长文测量后要再校正一次
  useEffect(() => {
    if (entries.length === 0 || historyFocus >= 0) return
    if (jumpedVersion.current === historyVersion) return
    jumpedVersion.current = historyVersion
    const jump = () => {
      userScrolledUp.current = false
      setAtBottom(true)
      virtuoso.current?.scrollToIndex({ index: entryCount.current - 1, align: 'end', behavior: 'auto' })
    }
    const timers = [0, 50, 150].map((ms) => window.setTimeout(jump, ms))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [historyVersion, entries.length, historyFocus])

  useEffect(() => {
    if (!newest || newest === lastUserId.current) return
    lastUserId.current = newest
    userScrolledUp.current = false
    setAtBottom(true)
    const frame = requestAnimationFrame(() => virtuoso.current?.scrollToIndex({ index: entryCount.current - 1, align: 'end', behavior: 'auto' }))
    return () => cancelAnimationFrame(frame)
  }, [newest])

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      userScrolledUp.current = true
      setAtBottom(false)
    }
  }

  if (entries.length === 0) {
    return <div className="flex-1" />
  }

  return (
    <div className="relative flex-1" role="log" aria-label="conversation" onWheel={handleWheel}>
      <Virtuoso
        key={historyVersion}
        ref={virtuoso}
        data={entries}
        className="h-full"
        components={{ Header: HistoryHeader, Footer: StreamFooterSpacer }}
        initialTopMostItemIndex={historyFocus >= 0 ? historyFocus : Math.max(0, entries.length - 1)}
        followOutput={atBottom && !userScrolledUp.current ? 'auto' : false}
        atBottomThreshold={32}
        atBottomStateChange={(bottom: boolean) => {
          setAtBottom(bottom)
          if (bottom) {
            userScrolledUp.current = false
          }
        }}
        rangeChanged={(r) => {
          range.current = { startIndex: r.startIndex, endIndex: r.endIndex }
        }}
        itemContent={(_, e) => (
          <div className="px-6 py-1.5">
            <div className="message-column">
              {e.type === 'user' ? (
                <UserRow key={e.id} text={e.text} images={e.images} onFork={e.nativeUuid && onForkFromMessage ? () => onForkFromMessage(e.nativeUuid!) : undefined} />
              ) : e.type === 'turnError' ? (
                <TurnErrorRow key={e.id} text={e.text} muted={e.muted} />
              ) : (
                <TurnView
                  key={e.id}
                  turn={e}
                  canRegenerate={!e.done ? false : e.id === entries[entries.length - 1]?.id && !!onRegenerate}
                  onRegenerate={onRegenerate}
                />
              )}
            </div>
          </div>
        )}
      />
      {/* 运行计时行(dsh 对齐):≥15s 才出现,aria-live */}
      {busy && turnStartedAt && Date.now() - turnStartedAt > 15_000 && (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0">
          <RunningTimer startedAt={turnStartedAt} />
        </div>
      )}
      {/* 回到底部微型胶囊:非钉底时浮动在右下角 */}
      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            userScrolledUp.current = false
            setAtBottom(true)
            virtuoso.current?.scrollToIndex({ index: entries.length - 1, align: 'end', behavior: 'smooth' })
          }}
          aria-label={t('ms.toBottom')}
          className="scroll-to-bottom-pill animate-pop-in"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
          </svg>
          <span>{busy ? '正在生成新内容 · 跳至最新' : '回到底部'}</span>
          {busy && <span className="dot accent live" style={{ width: 6, height: 6, marginLeft: 2 }} />}
        </button>
      )}
    </div>
  )
}

/** 历史分页:仅当还有更早消息时出现在列表顶部 */
function HistoryHeader() {
  const hasMore = useStore((s) => s.historyHasMore)
  const loadEarlier = useStore((s) => s.loadEarlierHistory)
  const busy = useStore((s) => s.busy)
  const hasPending = useStore((s) => s.permissions.length > 0 || s.question !== null)
  const [loading, setLoading] = useState(false)
  useLocale()
  if (!hasMore) return null
  const blocked = busy || hasPending
  return (
    <div className="history-more">
      <button
        className="btn btn-sm"
        disabled={loading || blocked}
        title={blocked ? '任务运行中或等待确认时不能加载更早的消息' : undefined}
        onClick={() => {
          if (blocked) return
          setLoading(true)
          // 先让按钮画出 loading,再同步回放旧消息
          window.setTimeout(() => {
            loadEarlier()
            setLoading(false)
          }, 0)
        }}
      >
        {loading ? '载入中…' : '加载更早的消息'}
      </button>
    </div>
  )
}

/** turn 错误行:result 非 success 时渲染在流末尾 */
function TurnErrorRow({ text, muted }: { text: string; muted?: boolean }) {
  useLocale()
  return (
    <div
      role={muted ? undefined : 'alert'}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        muted ? 'border-border bg-panel text-text-faint' : 'border-danger/40 bg-danger/5 text-danger'
      }`}
    >
      {!muted && <IconWarn width={14} height={14} className="shrink-0" />}
      <span className="font-mono">{text}</span>
    </div>
  )
}

/** ≥15s 运行计时(1s tick) */
function RunningTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useLocale()
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const sec = Math.floor((now - startedAt) / 1000)
  return (
    <p aria-live="polite" className="px-6 pb-1 text-center text-[11px] text-text-faint">
      {t('ms.running')} {sec >= 60 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${sec}s`}
    </p>
  )
}

/** 用户消息:`/命令` `@提及` chip 化装饰;hover 可复制/分叉 */
function UserRow({ text, onFork, images }: { text: string; onFork?: () => void; images?: string[] }) {
  const [image, setImage] = useState<string | null>(null)
  useLocale()
  return (
    <div className="msg-user animate-msg-in group">
      <div className="bubble-wrap">
        <div className="msg-actions">
          {onFork && (
            <button onClick={onFork} aria-label={t('ms.fork')} title={t('ms.fork')} className="icon-btn">
              <IconFork width={12} height={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('ccweb:edit-prompt', { detail: text }))
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
            }}
            aria-label="编辑提问"
            title="编辑并重新提问 (回填至输入框)"
            className="icon-btn"
          >
            <IconPencil width={12} height={12} />
          </button>
          <CopyBtn text={text} />
        </div>
        <div className="bubble">
          {text.split(/(\s+)/).map((token, index) => {
            const match = /^(\/[a-zA-Z][\w-]*|@[a-zA-Z][\w.-]*)$/.exec(token)
            if (match) {
              const isCommand = token.startsWith('/')
              return (
                <span key={index} className={`inline-chip ${isCommand ? 'cmd' : 'at'}`}>
                  {token}
                </span>
              )
            }
            return <span key={index}>{token}</span>
          })}
          {images?.map((src, index) => (
            <button key={index} onClick={() => setImage(src)} aria-label={`查看消息附件 ${index + 1}`}>
              <img src={src} alt={`消息附件 ${index + 1}`} style={{ maxWidth: 220, borderRadius: 8, marginTop: 8 }} />
            </button>
          ))}
        </div>
      </div>
      {image && <Lightbox src={image} onClose={() => setImage(null)} />}
    </div>
  )
}

type BlockGroup =
  | { kind: 'block'; block: Block; index: number }
  | { kind: 'tool-batch'; tools: Extract<Block, { kind: 'tool' }>[]; startIndex: number }

function groupBlocks(blocks: Block[]): BlockGroup[] {
  const groups: BlockGroup[] = []
  let currentTools: Extract<Block, { kind: 'tool' }>[] = []
  let toolStartIndex = 0

  const flushTools = () => {
    if (currentTools.length === 0) return
    if (currentTools.length === 1 && currentTools[0]) {
      groups.push({ kind: 'block', block: currentTools[0], index: toolStartIndex })
    } else {
      groups.push({ kind: 'tool-batch', tools: currentTools, startIndex: toolStartIndex })
    }
    currentTools = []
  }

  blocks.forEach((b, i) => {
    if (b.kind === 'tool') {
      if (currentTools.length === 0) {
        toolStartIndex = i
      }
      currentTools.push(b)
    } else {
      flushTools()
      groups.push({ kind: 'block', block: b, index: i })
    }
  })
  flushTools()
  return groups
}

function ToolBatchView({
  tools,
  turnDone,
}: {
  tools: Extract<Block, { kind: 'tool' }>[]
  turnDone?: boolean
}) {
  const hasError = tools.some((t) => t.status === 'error')
  const isRunning = tools.some((t) => t.status === 'running')
  const [open, setOpen] = useState(hasError || isRunning)

  const summaryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    tools.forEach((t) => {
      counts[t.toolName] = (counts[t.toolName] ?? 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => `${name} ${count}`)
      .join(' · ')
  }, [tools])

  return (
    <div className={`tool-batch-container ${hasError ? 'has-error' : ''} ${open ? 'is-expanded' : ''}`}>
      <button
        type="button"
        className="tool-batch-header"
        onClick={() => setOpen(!open)}
        title={open ? '折叠连续工具列表' : '展开查看连续工具详情'}
        aria-expanded={open}
      >
        <div className="tool-batch-meta">
          <span className={`tool-batch-icon ${hasError ? 'error' : isRunning ? 'running' : 'done'}`}>
            {hasError ? (
              <IconWarn width={13} height={13} style={{ color: 'var(--color-danger)' }} />
            ) : isRunning ? (
              <span className="ws-spinner" style={{ width: 12, height: 12 }} />
            ) : (
              <IconCheck width={13} height={13} style={{ color: 'var(--color-ok)' }} />
            )}
          </span>
          <span className="tool-batch-title">
            连续执行了 <strong>{tools.length}</strong> 项工具操作 ({summaryCounts})
          </span>
          {hasError && <span className="tool-batch-err-badge">包含报错</span>}
        </div>
        <div className="tool-batch-chevron">
          <IconChevron
            width={12}
            height={12}
            style={{
              transform: open ? 'rotate(180deg)' : undefined,
              transition: 'transform var(--dur-fast) ease',
            }}
          />
        </div>
      </button>

      {open && (
        <div className="tool-batch-list animate-slide-down">
          {tools.map((block, idx) => (
            <ToolCard key={block.toolUseId || idx} block={block} turnDone={turnDone} />
          ))}
        </div>
      )}
    </div>
  )
}

function TurnView({
  turn,
  canRegenerate,
  onRegenerate,
}: {
  turn: TurnEntry
  canRegenerate?: boolean
  onRegenerate?: () => void
}) {
  const [copiedFull, setCopiedFull] = useState(false)
  useLocale()
  const lastTextStreaming = (() => {
    for (let i = turn.blocks.length - 1; i >= 0; i--) {
      const b = turn.blocks[i]
      if (b && b.kind === 'text') return b.streaming
      if (b && b.kind === 'tool') return false
    }
    return false
  })()

  const fullText = turn.blocks
    .filter((b): b is Extract<Block, { kind: 'text' }> => b.kind === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n\n')

  const headings = useMemo(() => parseHeadings(fullText), [fullText])
  const [tocOpen, setTocOpen] = useState(false)
  const blockGroups = useMemo(() => groupBlocks(turn.blocks), [turn.blocks])

  return (
    <div className="msg-assistant group/turn relative">
      {blockGroups.map((g) =>
        g.kind === 'tool-batch' ? (
          <ToolBatchView key={`tool-batch-${g.startIndex}`} tools={g.tools} turnDone={turn.done} />
        ) : (
          <BlockView
            key={`block-${g.index}`}
            block={g.block}
            turnDone={turn.done}
            isLastText={g.block.kind === 'text' && g.block.streaming && lastTextStreaming}
          />
        ),
      )}
      <div className="turn-tail">
        <div className="turn-metrics">
          {turn.tail && (
            <span className="tabular">
              {turn.tail.totalS.toFixed(1)}s
              {turn.tail.ttftMs != null && ` · 首字 ${(turn.tail.ttftMs / 1000).toFixed(2)}s`}
              {turn.tail.tps != null && ` · ${turn.tail.tps.toFixed(0)} tok/s`}
            </span>
          )}
        </div>
        <div className="turn-actions">
          {turn.done && headings.length >= 2 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTocOpen(!tocOpen)}
                className={`turn-action-btn ${tocOpen ? 'is-active' : ''}`}
                title={`查看大纲目录 (共 ${headings.length} 节)`}
                aria-label="查看大纲"
              >
                <IconList width={12} height={12} />
                <span>大纲 ({headings.length})</span>
              </button>
              {tocOpen && (
                <div className="toc-dropdown animate-slide-down">
                  <div className="toc-header">
                    <span className="font-semibold text-text">目录大纲</span>
                    <button
                      type="button"
                      onClick={() => setTocOpen(false)}
                      className="icon-btn"
                      style={{ width: 20, height: 20 }}
                      title="关闭大纲"
                    >
                      <IconX width={11} height={11} />
                    </button>
                  </div>
                  <div className="toc-list">
                    {headings.map((h, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(h.id)
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            el.classList.add('heading-targeted')
                            setTimeout(() => el.classList.remove('heading-targeted'), 1600)
                          }
                          setTocOpen(false)
                        }}
                        className={`toc-item toc-level-${h.level}`}
                        title={h.text}
                      >
                        <span className="toc-dot">•</span>
                        <span className="toc-text">{h.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {turn.done && fullText.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                void copyText(fullText).then(() => {
                  setCopiedFull(true)
                  setTimeout(() => setCopiedFull(false), 1400)
                })
              }}
              className={`turn-action-btn ${copiedFull ? 'is-copied' : ''}`}
              title="复制本轮完整回答"
              aria-label="复制全文"
            >
              {copiedFull ? (
                <>
                  <IconCheck width={12} height={12} style={{ color: 'var(--color-ok)' }} />
                  <span>已复制全文</span>
                </>
              ) : (
                <>
                  <IconCopy width={12} height={12} />
                  <span>复制全文</span>
                </>
              )}
            </button>
          )}
          {canRegenerate && onRegenerate && (
            <button
              type="button"
              className="turn-action-btn turn-regenerate-btn"
              onClick={onRegenerate}
              title="重新生成这一轮回答"
              aria-label={t('ms.regenerate')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />
              </svg>
              <span>{t('ms.regenerate')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ApiErrorCard({ text }: { text: string }) {
  const is429 = text.includes('429') || text.toLowerCase().includes('rate limit') || text.includes('权限')
  const isAuth = text.includes('401') || text.toLowerCase().includes('unauthorized') || text.toLowerCase().includes('auth')
  const statusCodeMatch = /\((\d{3})\)/.exec(text) || /\b(\d{3})\b/.exec(text)
  const code = statusCodeMatch ? statusCodeMatch[1] : is429 ? '429' : isAuth ? '401' : 'ERR'

  return (
    <div
      className="api-error-card animate-fade-in"
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: '8px',
        background: 'color-mix(in srgb, var(--color-danger) 8%, var(--color-panel-2))',
        border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconWarn width={14} height={14} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <strong style={{ fontSize: 13, color: 'var(--color-danger)' }}>模型接口调用异常</strong>
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--color-danger)',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            HTTP {code}
          </span>
        </div>
      </div>
      <p
        style={{
          fontSize: 12,
          color: 'var(--color-text)',
          lineHeight: 1.6,
          fontFamily: 'var(--font-mono)',
          wordBreak: 'break-all',
          margin: '0 0 10px 0',
          padding: '8px 10px',
          background: 'color-mix(in srgb, var(--color-panel) 80%, transparent)',
          borderRadius: 5,
        }}
      >
        {text}
      </p>
      {is429 && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-dim)', marginBottom: 10 }}>
          建议：当前模型由于订阅权限或频控限制暂时无法响应，建议点击底部模型菜单切换其他可用模型。
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          style={{ fontSize: 11, height: 24, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => {
            void copyText(text).then(() => {
              useStore.getState().setNotice('已复制错误信息')
            })
          }}
        >
          <IconCopy width={11} height={11} />
          <span>复制报错</span>
        </button>
      </div>
    </div>
  )
}

function BlockView({ block, turnDone, isLastText }: { block: Block; turnDone?: boolean; isLastText: boolean }) {
  const [copied, setCopied] = useState(false)
  useLocale()
  if (block.kind === 'thinking') return <ThinkingBlock block={block} />
  if (block.kind === 'tool') return <ToolCard block={block} turnDone={turnDone} />
  if (
    block.kind === 'text' &&
    !block.streaming &&
    Boolean(block.text) &&
    (/^(?:API Error:.*|Request rejected.*|\b429\b.*|\b401\b.*)/i.test(block.text.trim()) ||
      block.text.includes('API Error:'))
  ) {
    return <ApiErrorCard text={block.text} />
  }
  return (
    <div className={`group relative ${isLastText ? 'stream-caret' : ''}`}>
      <Markdown text={block.text || '…'} />
      {!block.streaming && block.text && (
        <button
          onClick={() => {
            void copyText(block.text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
          className="icon-btn msg-copy-float"
          title={copied ? t('ms.copied') : t('ms.copy')}
          aria-label={copied ? t('ms.copied') : t('ms.copy')}
        >
          {copied ? <IconCheck width={12} height={12} style={{ color: 'var(--color-ok)' }} /> : <IconCopy width={12} height={12} />}
        </button>
      )}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useLocale()
  return (
    <button
      onClick={() => {
        void copyText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="icon-btn"
      title={copied ? t('ms.copied') : t('ms.copy')}
      aria-label={copied ? t('ms.copied') : t('ms.copy')}
    >
      {copied ? <IconCheck width={12} height={12} style={{ color: 'var(--color-ok)' }} /> : <IconCopy width={12} height={12} />}
    </button>
  )
}
