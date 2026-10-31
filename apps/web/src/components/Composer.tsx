import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconSend, IconStop, IconFile } from './Icon'
import RunControls from './RunControls'
import Lightbox from './Lightbox'

interface Props {
  onSend: (text: string, images?: string[]) => string | false
  onInterrupt: () => void
  /** @文件补全:向 server 发起工作区文件搜索 */
  onSearchFiles?: (query: string) => void
  /** hero 模式:空态居中大输入框 */
  hero?: boolean
  sendControl?: (message: Record<string, unknown>) => void
}

export default function Composer({ onSend, onInterrupt, onSearchFiles, sendControl, hero = false }: Props) {
  const sessionId = useStore(s => s.sessionId)
  const settingsReady = useStore(s => s.settings !== null)
  const workspace = useStore(s => s.settings?.workspace)
  const key = `ccweb.draft:${workspace ?? 'launch'}:${sessionId ?? 'new'}`
  const [text, setText] = useState(() => localStorage.getItem(key) ?? '')
  const draftKey = useRef(key)
  useEffect(() => {
    if (draftKey.current === key) return
    const previous = draftKey.current
    const saved = localStorage.getItem(key)
    const launchDraft = previous.startsWith('ccweb.draft:launch:') ? localStorage.getItem(previous) : null
    draftKey.current = key
    if (!saved && launchDraft) { localStorage.setItem(key, launchDraft); localStorage.removeItem(previous); setText(launchDraft) }
    else setText(saved ?? '')
  }, [key])
  const updateText = (value: string) => { setText(value); localStorage.setItem(key, value) }
  const [images, setImages] = useState<string[]>([])
  useEffect(() => { setImages([]) }, [key])
  useEffect(() => { useStore.setState({ attachmentDraft: images.length > 0 }); return () => useStore.setState({ attachmentDraft: false }) }, [images.length])
  const [slashSel, setSlashSel] = useState(0)
  const [fileSel, setFileSel] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  useLocale()
  const conn = useStore(s => s.conn)
  const waiting = useStore(s => s.permissions.length > 0 || s.question !== null)
  const lastAck = useStore(s => s.lastAck)
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => { if (!lastAck || !pending || lastAck.id !== pending) return; setText(localStorage.getItem(draftKey.current) ?? ''); if (lastAck.ok) setImages([]); setPending(null) }, [lastAck, pending])
  useEffect(() => { const protect = (event: BeforeUnloadEvent) => { if (images.length) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect) }, [images.length])
  const busy = useStore((s) => s.busy)
  const slashCommands = useStore((s) => s.slashCommands)
  const fileResults = useStore((s) => s.fileResults)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 粘贴/选择/拖放的图片 → data URL 附件 */
  const addImages = (files: FileList | File[] | null) => {
    if (!files) return
    if (images.length + files.length > 5) { useStore.getState().setError('最多附加 5 张图片；请先移除已有附件。'); return }
    const imgs: string[] = []
    let pending = 0
    for (const f of Array.from(files)) {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) { useStore.getState().setError('附件只支持 PNG/JPEG/GIF/WebP，每张最大 5 MiB。'); continue }
      pending++
      const r = new FileReader()
      r.onload = () => {
        if (typeof r.result === 'string') imgs.push(r.result)
        if (--pending === 0) setImages((prev) => [...prev, ...imgs].slice(0, 5))
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
    if (!settingsReady || pending || conn !== "open" || waiting || (!txt && images.length === 0)) return
    const request = onSend(txt || t('cp.imageOnly'), images.length ? images : undefined)
    if (request === 'local') { updateText(''); setImages([]) }
    else if (request) { setPending(request) }
  }

  const pickSlash = (name: string) => {
    updateText(`/${name} `)
    setSlashSel(0)
    taRef.current?.focus()
  }

  /** 选中文件:把末尾 @词 替换为 @相对路径 (带尾空格,结束补全态) */
  const pickFile = (path: string) => {
    updateText(text.replace(/@[^\s@]*$/, `@${path} `))
    setFileSel(0)
    taRef.current?.focus()
  }

  return (
    <div className={`composer-container ${hero ? 'composer-hero' : ''}`}>
      <div className="composer-card">
      <div className="composer-inner">
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
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
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
            aria-label="任务输入"
            onChange={(e) => updateText(e.target.value)}
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
              // IME 组合中一律让路(Enter 确认候选/方向键选词),避免误发送误中断
              const ne = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
              if (ne.isComposing || ne.keyCode === 229) return
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
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
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
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
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
        </div>
        <div className="composer-toolbar">
          <button
            onClick={() => fileRef.current?.click()}
            aria-label={t('cp.addImage')}
            title={t('cp.addImage')}
            className="attachment-trigger grid size-8 shrink-0 place-items-center rounded-lg text-text-faint hover:bg-panel-2 hover:text-text-dim"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" />
            </svg>
          </button>

          {sendControl && <RunControls send={sendControl} />}
          <div className="composer-actions">
            {(busy || waiting) && <button onClick={onInterrupt} aria-label={t('cp.stop')} className="composer-stop"><IconStop width={16} height={16} />停止</button>}
            <button onClick={submit} disabled={!settingsReady || !!pending || conn !== 'open' || waiting || (!text.trim() && images.length === 0)} aria-label={busy ? '排队发送' : t('cp.send')} className="composer-send"><IconSend width={18} height={18} />{busy ? '排队发送' : '发送任务'}</button>
          </div>
        </div>
        {!settingsReady && <p role="status" className="draft-preserved">正在读取工作区配置，草稿已保留…</p>}
        {waiting && <p className="draft-preserved">正在等待你的回应，草稿已保留</p>}

      </div>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
