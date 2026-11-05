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
import { IconFork, IconWarn, IconCopy, IconCheck, IconPencil } from './Icon'

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
      setAtBottom(true)
      virtuoso.current?.scrollToIndex({ index: entryCount.current - 1, align: 'end', behavior: 'auto' })
    }
    const timers = [0, 120, 400, 900].map((ms) => window.setTimeout(jump, ms))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [historyVersion, entries.length, historyFocus])

  useEffect(() => {
    if (!newest || newest === lastUserId.current) return
    lastUserId.current = newest
    setAtBottom(true)
    const frame = requestAnimationFrame(() => virtuoso.current?.scrollToIndex({ index: entryCount.current - 1, align: 'end', behavior: 'auto' }))
    return () => cancelAnimationFrame(frame)
  }, [newest])

  useEffect(() => {
    if (entries.length === 0) return
    if (atBottom) virtuoso.current?.scrollToIndex({ index: entries.length - 1, align: 'end', behavior: 'auto' })
  }, [entries, busy, atBottom])

  if (entries.length === 0) {
    return <div className="flex-1" />
  }

  return (
    <div className="relative flex-1" role="log" aria-label="conversation">
      <Virtuoso
        key={historyVersion}
        ref={virtuoso}
        data={entries}
        className="h-full"
        components={{ Header: HistoryHeader }}
        initialTopMostItemIndex={historyFocus >= 0 ? historyFocus : Math.max(0, entries.length - 1)}
        followOutput={atBottom ? 'auto' : false}
        atBottomStateChange={(b: boolean) => setAtBottom(b)}
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
      {/* 回到底部(dsh 对齐):非钉底时浮动 */}
      {!atBottom && (
        <button
          onClick={() => virtuoso.current?.scrollToIndex({ index: entries.length - 1, align: 'end', behavior: 'smooth' })}
          aria-label={t('ms.toBottom')}
          className="animate-pop-in absolute bottom-4 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border-strong bg-panel text-text-dim shadow-xl hover:text-text"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
          </svg>
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
              window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: text }))
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
            }}
            aria-label="编辑提问"
            title="编辑并重新提问 (填入输入框)"
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

  return (
    <div className="msg-assistant group/turn relative">
      {turn.blocks.map((b, i) => (
        <BlockView key={i} block={b} turnDone={turn.done} isLastText={b.kind === 'text' && b.streaming && lastTextStreaming} />
      ))}
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

function BlockView({ block, turnDone, isLastText }: { block: Block; turnDone?: boolean; isLastText: boolean }) {
  const [copied, setCopied] = useState(false)
  useLocale()
  if (block.kind === 'thinking') return <ThinkingBlock block={block} />
  if (block.kind === 'tool') return <ToolCard block={block} turnDone={turnDone} />
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
