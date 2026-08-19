import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useStore, visibleEntries } from '../store'
import { t, useLocale } from '../i18n'
import type { Block, TurnEntry } from '../render/blocks'
import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCard from './ToolCard'
import { copyText } from '../clipboard'
import { IconFork } from './Icon'

interface StreamProps {
  onRegenerate?: () => void
  /** 消息级 fork:从用户消息行分叉(SDK 为会话级 fork,从现会话末尾复制) */
  onForkFromMessage?: () => void
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
  const virtuoso = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)
  const range = useRef({ startIndex: 0, endIndex: 0 })
  useLocale()

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
        ref={virtuoso}
        data={entries}
        className="h-full"
        atBottomStateChange={(b: boolean) => setAtBottom(b)}
        rangeChanged={(r) => {
          range.current = { startIndex: r.startIndex, endIndex: r.endIndex }
        }}
        itemContent={(_, e) => (
          <div className="px-6 py-1.5">
            <div className="mx-auto max-w-3xl">
              {e.type === 'user' ? (
                <UserRow key={e.id} text={e.text} onFork={onForkFromMessage} />
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

/** 用户消息:`/命令` `@提及` chip 化装饰(dsh projectUserText 对齐);hover 可复制/分叉 */
function UserRow({ text, onFork }: { text: string; onFork?: () => void }) {
  useLocale()
  return (
    <div className="animate-msg-in group flex justify-end">
      <div className="max-w-[80%] rounded-xl rounded-br-sm border border-border-strong bg-panel-2 px-4 py-2.5">
        {text.split(/(\s+)/).map((tok, i) => {
          const m = /^(\/[a-zA-Z][\w-]*|@[a-zA-Z][\w.-]*)$/.exec(tok)
          if (m) {
            const isCmd = tok.startsWith('/')
            return (
              <span
                key={i}
                className={`mx-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] ${
                  isCmd ? 'bg-accent/15 text-accent' : 'bg-ok/15 text-ok'
                }`}
              >
                {tok}
              </span>
            )
          }
          return <span key={i}>{tok}</span>
        })}
      </div>
      {onFork && (
        <button
          onClick={onFork}
          aria-label={t('ms.fork')}
          title={t('ms.fork')}
          className="ml-1.5 grid size-6 shrink-0 place-items-center self-center rounded-md border border-border bg-panel text-text-faint opacity-0 transition-opacity focus-visible:opacity-100 hover:text-text group-hover:opacity-100"
        >
          <IconFork width={12} height={12} />
        </button>
      )}
      <CopyBtn text={text} className="ml-1.5 self-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" />
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
  useLocale()
  const lastTextStreaming = (() => {
    for (let i = turn.blocks.length - 1; i >= 0; i--) {
      const b = turn.blocks[i]
      if (b && b.kind === 'text') return b.streaming
      if (b && b.kind === 'tool') return false
    }
    return false
  })()

  return (
    <div className="group/turn space-y-1">
      {turn.blocks.map((b, i) => (
        <BlockView key={i} block={b} isLastText={b.kind === 'text' && b.streaming && lastTextStreaming} />
      ))}
      <div className="flex items-center gap-2">
        {turn.tail && (
          <p className="font-mono text-[10px] tabular text-text-faint">
            ⏱ {turn.tail.totalS.toFixed(1)}s
            {turn.tail.ttftMs != null && ` · TTFT ${(turn.tail.ttftMs / 1000).toFixed(2)}s`}
            {turn.tail.tps != null && ` · ${turn.tail.tps.toFixed(0)} tok/s`}
          </p>
        )}
        {canRegenerate && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-text-faint opacity-0 transition-opacity focus-visible:opacity-100 hover:text-text-dim group-hover/turn:opacity-100"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />
            </svg>
            {t('ms.regenerate')}
          </button>
        )}
      </div>
    </div>
  )
}

function BlockView({ block, isLastText }: { block: Block; isLastText: boolean }) {
  const [copied, setCopied] = useState(false)
  useLocale()
  if (block.kind === 'thinking') return <ThinkingBlock block={block} />
  if (block.kind === 'tool') return <ToolCard block={block} />
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
          className="absolute -right-14 top-0 rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint opacity-0 transition-opacity focus-visible:opacity-100 hover:text-text group-hover:opacity-100"
        >
          {copied ? t('ms.copied') : t('ms.copy')}
        </button>
      )}
    </div>
  )
}

function CopyBtn({ text, className }: { text: string; className?: string }) {
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
      className={`rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint transition-colors hover:text-text ${className ?? ''}`}
    >
      {copied ? t('ms.copied') : t('ms.copy')}
    </button>
  )
}
