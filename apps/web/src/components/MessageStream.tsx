import { useEffect, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useStore, visibleEntries } from '../store'
import type { Block, TurnEntry } from '../render/blocks'
import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCard from './ToolCard'

/**
 * 消息流:react-virtuoso 虚拟滚动(10k+ 消息 60fps,SPEC §3.4 质量门),
 * followOutput 流式期间自动吸底,用户上滚即停止跟随。
 */
export default function MessageStream() {
  const entries = useStore((s) => visibleEntries(s.entries))
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
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid h-full place-items-center">
          <div className="text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-border bg-panel text-xl">
              ⌘
            </div>
            <h2 className="text-base font-medium">开始新对话</h2>
            <p className="mt-1 text-sm text-text-dim">
              输入任务,回车发送 · Esc 中断 · 完整 ~/.claude 配置自动生效
            </p>
          </div>
        </div>
      </div>
    )
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
              {e.type === 'user' ? <UserRow key={e.id} text={e.text} /> : <TurnView key={e.id} turn={e} />}
            </div>
          </div>
        )}
      />
    </div>
  )
}

function UserRow({ text }: { text: string }) {
  return (
    <div className="group flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-border-strong bg-panel-2 px-4 py-2.5">
        {text}
      </div>
      <CopyBtn text={text} className="ml-1.5 self-center opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}

function TurnView({ turn }: { turn: TurnEntry }) {
  const lastTextStreaming = (() => {
    for (let i = turn.blocks.length - 1; i >= 0; i--) {
      const b = turn.blocks[i]
      if (b && b.kind === 'text') return b.streaming
      if (b && b.kind === 'tool') return false
    }
    return false
  })()

  return (
    <div className="space-y-1">
      {turn.blocks.map((b, i) => (
        <BlockView key={i} block={b} isLastText={b.kind === 'text' && b.streaming && lastTextStreaming} />
      ))}
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
