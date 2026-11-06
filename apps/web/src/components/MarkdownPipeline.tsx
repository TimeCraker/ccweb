import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { t, useLocale } from '../i18n'
import { copyText } from '../clipboard'
import { IconChevron, IconCopy, IconCheck } from './Icon'

const COLLAPSE_LINE_THRESHOLD = 24

/** 代码块: dsh 对齐 —— 语言标签 + 行数统计 + 复制按钮 + 超长折叠展开 */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
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

  return (
    <div className={`codeblock group/code relative my-2.5 overflow-hidden rounded-lg border border-border ${shouldCollapse ? 'is-collapsed' : ''}`}>
      <div className="flex h-8 items-center justify-between border-b border-border bg-panel-2/60 px-3">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-faint flex items-center gap-1.5">
          <span className="font-semibold text-text-dim">{lang || 'text'}</span>
          {lines > 0 && <span>· {lines} 行</span>}
        </span>
        <button
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

      <div className={`codeblock-body relative ${shouldCollapse ? 'max-h-[380px] overflow-hidden' : ''}`}>
        <pre className="!m-0 !rounded-none !border-0 font-mono text-[12px] leading-relaxed">{child ?? children}</pre>
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
