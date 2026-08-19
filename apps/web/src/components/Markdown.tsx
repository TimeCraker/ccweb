import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { t, useLocale } from '../i18n'
import { copyText } from '../clipboard'

/** 代码块:dsh 对齐 —— 语言标签 + 复制按钮(copy→1s 打勾) */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  useLocale()
  // react-markdown 传来的 <code className="language-xxx">
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

  return (
    <div className="codeblock group/code relative my-2.5 overflow-hidden rounded-lg border border-border">
      <div className="flex h-8 items-center justify-between border-b border-border bg-panel-2/60 px-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
          {lang || 'text'}
        </span>
        <button
          onClick={() => {
            void copyText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1000)
            })
          }}
          aria-label={t('ms.copyCode')}
          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            copied ? 'text-ok' : 'text-text-faint opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 hover:text-text-dim'
          }`}
        >
          {copied ? `✓ ${t('ms.copied')}` : t('ms.copyCode')}
        </button>
      </div>
      <pre className="!m-0 !rounded-none !border-0">{child ?? children}</pre>
    </div>
  )
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  return ''
}

/** 流式安全的 markdown 渲染:GFM + 代码高亮 + 代码块头部(语言/复制) */
const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ pre: (props) => <CodeBlock>{props.children}</CodeBlock> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown
