import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useStore, visibleEntries } from '../store'
import type { Block, TurnEntry } from '../render/blocks'
import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCard from './ToolCard'

/**
 * 消息流:react-virtuoso 虚拟滚动(10k+ 消息 60fps,SPEC §3.4 质量门),
 * followOutput 流式期间自动吸底,用户上滚即停止跟随。
 * 注意:zustand selector 必须返回稳定引用(派生数组放 useMemo),
 * 返回新数组引用会触发 React18 无限重渲染(#185)。
 */
interface StreamProps {
  onRegenerate?: () => void
}

export default function MessageStream({ onRegenerate }: StreamProps) {
  const rawEntries = useStore((s) => s.entries)
  const entries = useMemo(() => visibleEntries(rawEntries), [rawEntries])
  const busy = useStore((s) => s.busy)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const range = useRef({ visibleRange: null as { startIndex: number; endIndex: number } | null })

  useEffect(() => {
    if (entries.length === 0) return
    const r = range.current.visibleRange
    const nearBottom = r ? entries.length - 1 - r.endIndex <= 2 : true
    if (nearBottom) virtuoso.current?.scrollToIndex({ index: entries.length - 1, align: 'end', behavior: 'auto' })
  }, [entries, busy])

  if (entries.length === 0) {
    // 空态由 App 层的 hero 布局接管(居中品牌 + 大输入框)
    return <div className="flex-1" />
  }

  return (
    <div className="flex-1" role="log" aria-label="conversation">
      <Virtuoso
        ref={virtuoso}
        data={entries}
        className="h-full"
        rangeChanged={(r) => {
          range.current.visibleRange = { startIndex: r.startIndex, endIndex: r.endIndex }
        }}
        itemContent={(_, e) => (
          <div className="px-6 py-1.5">
            <div className="mx-auto max-w-3xl">
              {e.type === 'user' ? (
                <UserRow key={e.id} text={e.text} />
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
    </div>
  )
}

function UserRow({ text }: { text: string }) {
  return (
    <div className="animate-msg-in group flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-border-strong bg-panel-2 px-4 py-2.5">
        {text}
      </div>
      <CopyBtn text={text} className="ml-1.5 self-center opacity-0 transition-opacity group-hover:opacity-100" />
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
      {canRegenerate && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-text-faint opacity-0 transition-opacity hover:text-text-dim group-hover/turn:opacity-100"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />
          </svg>
          重新生成
        </button>
      )}
    </div>
  )
}

function BlockView({ block, isLastText }: { block: Block; isLastText: boolean }) {
  const [copied, setCopied] = useState(false)
  if (block.kind === 'thinking') return <ThinkingBlock block={block} />
  if (block.kind === 'tool') return <ToolCard block={block} />
  return (
    <div className={`group relative ${isLastText ? 'stream-caret' : ''}`}>
      <Markdown text={block.text || '…'} />
      {!block.streaming && block.text && (
        <button
          aria-label="copy message"
          onClick={() => {
            void navigator.clipboard.writeText(block.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="absolute -right-14 top-0 rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
        >
          {copied ? '已复制' : '复制'}
        </button>
      )}
    </div>
  )
}

function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      aria-label="copy message"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className={`rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint transition-colors hover:text-text ${className ?? ''}`}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}
