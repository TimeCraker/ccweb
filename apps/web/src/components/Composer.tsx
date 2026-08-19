import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconSend, IconStop, IconFile } from './Icon'
import Lightbox from './Lightbox'

interface Props {
  onSend: (text: string, images?: string[]) => void
  onInterrupt: () => void
  /** @文件补全:向 server 发起工作区文件搜索 */
  onSearchFiles?: (query: string) => void
  /** hero 模式:空态居中大输入框 */
  hero?: boolean
}

export default function Composer({ onSend, onInterrupt, onSearchFiles, hero = false }: Props) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [slashSel, setSlashSel] = useState(0)
  const [fileSel, setFileSel] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  useLocale()
  const busy = useStore((s) => s.busy)
  const slashCommands = useStore((s) => s.slashCommands)
  const fileResults = useStore((s) => s.fileResults)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 粘贴/选择/拖放的图片 → data URL 附件 */
  const addImages = (files: FileList | File[] | null) => {
    if (!files) return
    const imgs: string[] = []
    let pending = 0
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      pending++
      const r = new FileReader()
      r.onload = () => {
        if (typeof r.result === 'string') imgs.push(r.result)
        if (--pending === 0) setImages((prev) => [...prev, ...imgs])
      }
      r.readAsDataURL(f)
    }
  }

  /** 斜杠命令补全:输入以 / 开头(且仅首词)时弹出过滤列表 */
  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || text.includes('\n')) return []
    const word = text.slice(1)
    return slashCommands
      .filter((c) => c.name.toLowerCase().includes(word.toLowerCase()))
      .slice(0, 8)
  }, [text, slashCommands])

  /** @文件补全:末词以 @ 开头(词边界检测,行首或空白后)时激活 */
  const atQuery = useMemo(() => {
    const m = /(?:^|\s)@([^\s@]*)$/.exec(text)
    return m ? (m[1] ?? '') : null
  }, [text])

  /** 客户端再过滤一次(server 结果可能滞后于输入),与斜杠面板同款交互 */
  const fileMatches = useMemo(() => {
    if (atQuery == null) return []
    const q = atQuery.toLowerCase()
    return fileResults.filter((f) => f.toLowerCase().includes(q)).slice(0, 15)
  }, [atQuery, fileResults])

  // 激活词变化:防抖发起搜索 + 重置选中项
  useEffect(() => {
    setFileSel(0)
    if (atQuery == null || !onSearchFiles) return
    const h = setTimeout(() => onSearchFiles(atQuery), 200)
    return () => clearTimeout(h)
  }, [atQuery, onSearchFiles])

  const submit = () => {
    const txt = text.trim()
    // busy 时 Enter = 排队发送(dsh Queue 语义),不吞输入;@路径 原样保留(Claude 自行理解)
    if (!txt && images.length === 0) return
    onSend(txt || t('cp.imageOnly'), images.length ? images : undefined)
    setText('')
    setImages([])
  }

  const pickSlash = (name: string) => {
    setText(`/${name} `)
    setSlashSel(0)
    taRef.current?.focus()
  }

  /** 选中文件:把末尾 @词 替换为 @相对路径 (带尾空格,结束补全态) */
  const pickFile = (path: string) => {
    setText((prev) => prev.replace(/@[^\s@]*$/, `@${path} `))
    setFileSel(0)
    taRef.current?.focus()
  }

  return (
    <div className={hero ? 'relative w-full' : 'relative border-t border-border bg-panel px-6 py-4'}>
      <div className={hero ? '' : 'mx-auto max-w-3xl'}>
        {slashMatches.length > 0 && (
          <div className="animate-pop-in absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border-strong bg-panel p-1.5 shadow-2xl">
            {slashMatches.map((c, i) => (
              <button
                key={c.name}
                onClick={() => pickSlash(c.name)}
                onMouseEnter={() => setSlashSel(i)}
                className={`flex w-full items-baseline gap-2.5 rounded-lg px-3 py-1.5 text-left ${
                  i === slashSel ? 'bg-panel-2' : ''
                }`}
              >
                <span className="font-mono text-xs text-accent">/{c.name}</span>
                <span className="truncate text-[11px] text-text-faint">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        {fileMatches.length > 0 && (
          <div className="animate-pop-in absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border-strong bg-panel p-1.5 shadow-2xl">
            {fileMatches.map((f, i) => (
              <button
                key={f}
                onClick={() => pickFile(f)}
                onMouseEnter={() => setFileSel(i)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left ${
                  i === fileSel ? 'bg-panel-2' : ''
                }`}
              >
                <IconFile width={12} height={12} className="shrink-0 text-accent" />
                <span className="truncate font-mono text-[11px] text-text-dim" title={f}>
                  {f}
                </span>
              </button>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="group relative">
                <img
                  src={src}
                  alt={`${t('cp.previewImage')} ${i + 1}`}
                  title={t('cp.previewImage')}
                  onClick={() => setLightbox(src)}
                  className="size-16 cursor-zoom-in rounded-lg border border-border object-cover transition-opacity hover:opacity-85"
                />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={t('cp.removeImage')}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-panel text-[10px] text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={`composer-shell flex items-end gap-2 rounded-2xl px-3.5 py-2.5 ${
            hero ? 'bg-panel shadow-lg' : 'rounded-xl bg-panel-2'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addImages(e.dataTransfer?.files ?? null)
          }}
        >
          <button
            onClick={() => fileRef.current?.click()}
            aria-label={t('cp.addImage')}
            title={t('cp.addImage')}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-text-faint hover:bg-panel-2 hover:text-text-dim"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addImages(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
                f.type.startsWith('image/'),
              )
              if (files.length > 0) {
                e.preventDefault()
                addImages(files)
              }
            }}
            onKeyDown={(e) => {
              if (slashMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSlashSel((s) => Math.min(s + 1, slashMatches.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSlashSel((s) => Math.max(s - 1, 0))
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  pickSlash(slashMatches[slashSel]?.name ?? '')
                  return
                }
              } else if (fileMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setFileSel((s) => Math.min(s + 1, fileMatches.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setFileSel((s) => Math.max(s - 1, 0))
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  pickFile(fileMatches[fileSel] ?? fileMatches[0] ?? '')
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape' && busy) {
                e.preventDefault()
                onInterrupt()
              }
            }}
            rows={1}
            placeholder={busy ? t('cp.queuePlaceholder') : t('cp.placeholder')}
            className="max-h-48 min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-text-faint"
          />
          {busy ? (
            <button
              onClick={onInterrupt}
              aria-label={t('cp.stop')}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border-strong text-text-dim transition-colors hover:border-danger hover:text-danger"
            >
              <IconStop width={14} height={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() && images.length === 0}
              aria-label={t('cp.send')}
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconSend width={14} height={14} />
            </button>
          )}
        </div>
        {!hero && (
          <p className="mt-2 text-center text-[11px] text-text-faint">{t('cp.hint')}</p>
        )}
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
