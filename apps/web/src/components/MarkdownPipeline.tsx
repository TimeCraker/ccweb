import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { t, useLocale } from '../i18n'
import { copyText } from '../clipboard'
import { IconChevron, IconCopy, IconCheck, IconQuote } from './Icon'

const COLLAPSE_LINE_THRESHOLD = 24

/** 代码块: 语言标签 + 行号 + 引用/复制按钮 + 超长折叠展开 */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [quoted, setQuoted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useLocale()

  let lang = ''
  let code = ''
  const child = Array.isArray(children) ? children[0] : children
  if (child && typeof child === 'object' && 'props' in (child as Record<string, unknown>)) {
    const props = (child as { props?: { className?: string; children?: ReactNode } }).props
    lang = /language-(\w+)/.exec(props?.className ?? '')?.[1] ?? ''
    code = extractText(props?.children)
  } else {
    code = extractText(children)
  }

  const lines = code ? code.split('\n').length : 0
  const isLong = lines > COLLAPSE_LINE_THRESHOLD
  const shouldCollapse = isLong && !expanded

  const quoteCode = () => {
    window.dispatchEvent(
      new CustomEvent('ccweb:quote-code', {
        detail: { lang, code },
      })
    )
    setQuoted(true)
    setTimeout(() => setQuoted(false), 1200)
  }

  return (
    <div className={`codeblock group/code relative my-2.5 overflow-hidden rounded-lg border border-border ${shouldCollapse ? 'is-collapsed' : ''}`}>
      <div className="flex h-8 items-center justify-between border-b border-border bg-panel-2/60 px-3">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-faint flex items-center gap-1.5">
          <span className="font-semibold text-text-dim">{lang || 'text'}</span>
          {lines > 0 && <span>· {lines} 行</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={quoteCode}
            aria-label="引用到输入框"
            title="将代码以 Markdown 格式引用到提问输入框"
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              quoted
                ? 'text-ok bg-ok/10'
                : 'text-text-faint hover:text-text hover:bg-panel-3'
            }`}
          >
            {quoted ? (
              <>
                <IconCheck width={11} height={11} style={{ color: 'var(--color-ok)' }} />
                <span>已引用</span>
              </>
            ) : (
              <>
                <IconQuote width={11} height={11} />
                <span>引用</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              void copyText(code).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}
            aria-label={t('ms.copyCode')}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              copied
                ? 'text-ok bg-ok/10'
                : 'text-text-faint hover:text-text hover:bg-panel-3'
            }`}
          >
            {copied ? (
              <>
                <IconCheck width={11} height={11} style={{ color: 'var(--color-ok)' }} />
                <span>{t('ms.copied')}</span>
              </>
            ) : (
              <>
                <IconCopy width={11} height={11} />
                <span>{t('ms.copyCode')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className={`codeblock-body relative flex ${shouldCollapse ? 'max-h-[380px] overflow-hidden' : ''}`}>
        {lines > 1 && (
          <div
            className="codeblock-line-numbers select-none py-2.5 pl-2.5 pr-2 font-mono text-[11px] leading-relaxed text-text-faint/45 border-r border-border/30 text-right min-w-[2.2rem]"
            aria-hidden="true"
          >
            {Array.from({ length: lines }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <pre className="!m-0 !rounded-none !border-0 !p-2.5 font-mono text-[12px] leading-relaxed">{child ?? children}</pre>
        </div>
        {shouldCollapse && (
          <div className="codeblock-gradient-mask pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-panel via-panel/75 to-transparent" />
        )}
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="codeblock-expand-btn flex w-full items-center justify-center gap-1.5 border-t border-border bg-panel-2/70 py-1.5 text-[11px] font-medium text-text-dim hover:bg-panel-3 hover:text-text transition-colors"
        >
          <IconChevron
            width={11}
            height={11}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          <span>{expanded ? '收起完整代码' : `展开完整代码 (共 ${lines} 行)`}</span>
        </button>
      )}
    </div>
  )
}

export function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  return ''
}

function Heading({ level, children }: { level: 1 | 2 | 3; children?: ReactNode }) {
  const text = extractText(children)
  const id = text ? 'heading-' + encodeURIComponent(text.trim().toLowerCase().replace(/\s+/g, '-')) : undefined
  const Tag = `h${level}` as const
  return (
    <Tag id={id} className="scroll-mt-6 group/h relative">
      {children}
    </Tag>
  )
}

export default function MarkdownPipeline({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: (props) => <CodeBlock>{props.children}</CodeBlock>,
        h1: (props) => <Heading level={1}>{props.children}</Heading>,
        h2: (props) => <Heading level={2}>{props.children}</Heading>,
        h3: (props) => <Heading level={3}>{props.children}</Heading>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
