import { useEffect, useRef, useState } from 'react'
import { t, tf, useLocale } from '../i18n'
import type { ThinkingBlock as T } from '../render/blocks'
import { IconBrain, IconChevron, IconCopy, IconCheck } from './Icon'

export default function ThinkingBlock({ block }: { block: T }) {
  const [userTouched, setUserTouched] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const finalDurationRef = useRef<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLocale()

  const isStreaming = Boolean(block.streaming)
  // 如果用户没有手动操作过：思考中自动展开，思考完成后自动收起；用户手动点击后由 manualOpen 控制
  const isOpen = userTouched ? manualOpen : isStreaming

  // 思考计时器
  useEffect(() => {
    if (!isStreaming) {
      if (finalDurationRef.current === null && startRef.current) {
        finalDurationRef.current = Math.max(0.1, (Date.now() - startRef.current) / 1000)
      }
      return
    }
    const timer = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000)
    }, 100)
    return () => clearInterval(timer)
  }, [isStreaming])

  // 流式输出时，自动跟随最新内容滚动
  useEffect(() => {
    if (isOpen && isStreaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [block.text, isOpen, isStreaming])

  const lines = block.text.split('\n').length
  const durationSec = finalDurationRef.current ?? elapsed
  const durationText = durationSec > 0 ? `${durationSec.toFixed(1)}s` : ''

  const copyThinking = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(block.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <div className={`thinking ${isStreaming ? 'is-streaming' : 'is-done'} ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <div
        className="thinking-header"
        onClick={() => {
          setUserTouched(true)
          setManualOpen(!isOpen)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setUserTouched(true)
            setManualOpen(!isOpen)
          }
        }}
      >
        <div className="thinking-title">
          <IconBrain
            width={13}
            height={13}
            className={`thinking-brain-icon ${isStreaming ? 'pulse' : ''}`}
          />
          <span className="thinking-status">
            {isStreaming
              ? durationText
                ? `深度思考中 ${durationText}…`
                : t('th.thinking')
              : durationText
                ? `已深度思考 ${durationText} (共 ${lines} 行)`
                : tf('th.thought', lines)}
          </span>
        </div>

        <div className="thinking-actions" onClick={(e) => e.stopPropagation()}>
          {block.text && (
            <button
              type="button"
              className="thinking-copy-btn"
              onClick={copyThinking}
              title={copied ? t('ms.copied') : '复制思考过程'}
              aria-label="复制思考过程"
            >
              {copied ? (
                <IconCheck width={12} height={12} style={{ color: 'var(--color-ok)' }} />
              ) : (
                <IconCopy width={12} height={12} />
              )}
            </button>
          )}
          <button
            type="button"
            className="thinking-toggle-btn"
            onClick={() => {
              setUserTouched(true)
              setManualOpen(!isOpen)
            }}
            title={isOpen ? '收起思考过程' : '展开思考过程'}
          >
            <IconChevron
              width={12}
              height={12}
              className={`chev ${isOpen ? 'is-open' : ''}`}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div ref={bodyRef} className="thinking-body animate-slide-down">
          {block.text || '…'}
        </div>
      )}
    </div>
  )
}
