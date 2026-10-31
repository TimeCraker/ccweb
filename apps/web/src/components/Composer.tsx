import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { IconArrowUp, IconStop, IconFile, IconWarn } from './Icon'
import { AttachMenu, ModelMenu, ModeMenu } from './RunMenus'
import Lightbox from './Lightbox'

interface LastSendState {
  signature: string
  at: number
  acknowledged: boolean
}

/** 最近一次成功发送:放在模块级,避免空态→对话态切换导致 Composer 重挂载后丢失 */
let lastSend: LastSendState | null = null

interface Props {
  onSend: (text: string, images?: string[]) => string | false
  onInterrupt: () => void
  /** @文件补全:向 server 发起工作区文件搜索 */
  onSearchFiles?: (query: string) => void
  /** hero 模式:空态居中大输入框 */
  hero?: boolean
  sendControl?: (message: Record<string, unknown>) => void
  /** 无可用连接时打开设置里的连接表单 */
  onAddConnection?: () => void
  /** 连接切换后“新建并应用”(走 App 的导航保护) */
  onNewSession?: () => void
}

export default function Composer({
  onSend,
  onInterrupt,
  onSearchFiles,
  sendControl,
  hero = false,
  onAddConnection,
  onNewSession,
}: Props) {
  const sessionId = useStore((s) => s.sessionId)
  const settings = useStore((s) => s.settings)
  const settingsReady = settings !== null
  const workspace = useStore((s) => s.settings?.workspace)
  const key = `ccweb.draft:${workspace ?? 'launch'}:${sessionId ?? 'new'}`
  const [text, setText] = useState(() => localStorage.getItem(key) ?? '')
  const draftKey = useRef(key)
  useEffect(() => {
    if (draftKey.current === key) return
    const previous = draftKey.current
    const saved = localStorage.getItem(key)
    const launchDraft = previous.startsWith('ccweb.draft:launch:') ? localStorage.getItem(previous) : null
    draftKey.current = key
    if (!saved && launchDraft) {
      localStorage.setItem(key, launchDraft)
      localStorage.removeItem(previous)
      setText(launchDraft)
    } else setText(saved ?? '')
  }, [key])
  const updateText = (value: string) => {
    setText(value)
    localStorage.setItem(key, value)
  }
  const [images, setImages] = useState<string[]>([])
  useEffect(() => {
    setImages([])
  }, [key])
  useEffect(() => {
    useStore.setState({ attachmentDraft: images.length > 0 })
    return () => useStore.setState({ attachmentDraft: false })
  }, [images.length])
  const [slashSel, setSlashSel] = useState(0)
  const [fileSel, setFileSel] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const conn = useStore((s) => s.conn)
  const waiting = useStore((s) => s.permissions.length > 0 || s.question !== null)
  const lastAck = useStore((s) => s.lastAck)
  const [pending, setPending] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  useEffect(() => {
    if (!lastAck || !pending || lastAck.id !== pending) return
    setText(localStorage.getItem(draftKey.current) ?? '')
    if (lastAck.ok) {
      setImages([])
    }
    setPending(null)
  }, [lastAck, pending])
  // 空态→对话态切换会重挂载 Composer,pending 丢失;回执成功仍要记到模块级去重状态
  useEffect(() => {
    if (lastAck?.ok && lastSend && !lastSend.acknowledged) lastSend.acknowledged = true
  }, [lastAck])
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (images.length) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [images.length])
  const busy = useStore((s) => s.busy)
  const slashCommands = useStore((s) => s.slashCommands)
  const fileResults = useStore((s) => s.fileResults)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const liveModel = useStore((s) => s.model)
  const hasConnection = Boolean(
    settings &&
      !(
        settings.endpoints.length === 0 &&
        !settings.currentEndpoint &&
        !settings.currentModel &&
        !liveModel &&
        !settings.model &&
        settings.authentication !== 'native' &&
        !settings.active
      ),
  )

  /** 粘贴/选择/拖放的图片 → data URL 附件 */
  const addImages = (files: FileList | File[] | null) => {
    if (!files) return
    const list = Array.from(files)
    if (images.length + list.length > 5) {
      useStore.getState().setError('最多附加 5 张图片，请先移除已有附件。')
      return
    }
    const accepted: string[] = []
    let pendingReads = 0
    for (const file of list) {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        useStore.getState().setError('附件仅支持 PNG / JPEG / GIF / WebP，每张不超过 5 MB。')
        continue
      }
      pendingReads++
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') accepted.push(reader.result)
        if (--pendingReads === 0) setImages((prev) => [...prev, ...accepted].slice(0, 5))
      }
      reader.readAsDataURL(file)
    }
  }

  /** 斜杠命令补全:输入以 / 开头(且仅首词)时弹出过滤列表 */
  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || text.includes('\n')) return []
    const word = text.slice(1)
    return slashCommands.filter((command) => command.name.toLowerCase().includes(word.toLowerCase())).slice(0, 8)
  }, [text, slashCommands])

  /** @文件补全:末词以 @ 开头(词边界检测,行首或空白后)时激活 */
  const atQuery = useMemo(() => {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(text)
    return match ? (match[1] ?? '') : null
  }, [text])

  const fileMatches = useMemo(() => {
    if (atQuery == null) return []
    const q = atQuery.toLowerCase()
    return fileResults.filter((file) => file.toLowerCase().includes(q)).slice(0, 15)
  }, [atQuery, fileResults])

  // 激活词变化:防抖发起搜索 + 重置选中项
  useEffect(() => {
    setFileSel(0)
    if (atQuery == null || !onSearchFiles) return
    const timer = setTimeout(() => onSearchFiles(atQuery), 200)
    return () => clearTimeout(timer)
  }, [atQuery, onSearchFiles])

  useEffect(() => {
    setSlashSel(0)
  }, [text])

  const canSend = Boolean(text.trim() || images.length)
  const blocked = !settingsReady || !!pending || conn !== 'open' || waiting || !canSend

  const submit = () => {
    const trimmed = text.trim()
    if (!settingsReady || pending || conn !== 'open' || waiting || (!trimmed && images.length === 0)) return
    const signature = `${trimmed}|${images.length}:${images.reduce((sum, src) => sum + src.length, 0)}`
    const previous = lastSend
    if (
      previous &&
      previous.acknowledged &&
      previous.signature === signature &&
      Date.now() - previous.at < 20_000 &&
      !window.confirm('这次的内容和附件与刚发送的相同，仍要再发送一次吗？')
    ) {
      return
    }
    const request = onSend(trimmed || t('cp.imageOnly'), images.length ? images : undefined)
    if (request === 'local') {
      updateText('')
      setImages([])
    } else if (request) {
      lastSend = { signature, at: Date.now(), acknowledged: false }
      setPending(request)
    }
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

  const referenceFile = () => {
    const next = text.endsWith(' ') || text === '' ? `${text}@` : `${text} @`
    updateText(next)
    taRef.current?.focus()
  }

  return (
    <div
      className={`composer ${hero ? 'composer-hero' : ''} ${dragging ? 'is-drag' : ''}`}
      style={{ position: 'relative' }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          addImages(e.target.files)
          e.target.value = ''
        }}
      />

      {slashMatches.length > 0 && (
        <div className="suggestions" role="listbox" aria-label="斜杠命令">
          {slashMatches.map((command, index) => (
            <button
              key={command.name}
              className="suggestion"
              data-active={index === slashSel}
              onMouseEnter={() => setSlashSel(index)}
              onClick={() => pickSlash(command.name)}
            >
              <span className="name">/{command.name}</span>
              <span className="desc">{command.description}</span>
            </button>
          ))}
        </div>
      )}
      {slashMatches.length === 0 && fileMatches.length > 0 && (
        <div className="suggestions" role="listbox" aria-label={t('cp.attachFile')}>
          {fileMatches.map((file, index) => (
            <button
              key={file}
              className="suggestion"
              data-active={index === fileSel}
              onMouseEnter={() => setFileSel(index)}
              onClick={() => pickFile(file)}
            >
              <IconFile width={13} height={13} style={{ color: 'var(--color-accent)', flex: '0 0 auto' }} />
              <span className="desc" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', opacity: 1 }} title={file}>
                {file}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className="composer-main"
        onDragEnter={(e) => {
          if (!e.dataTransfer?.types.includes('Files')) return
          dragDepth.current++
          setDragging(true)
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addImages(e.dataTransfer?.files ?? null)
        }}
      >
        {images.length > 0 && (
          <div className="attachments">
            {images.map((src, index) => (
              <div key={index} className="attachment">
                <img
                  src={src}
                  alt={`${t('cp.previewImage')} ${index + 1}`}
                  title={t('cp.previewImage')}
                  onClick={() => setLightbox(src)}
                />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={t('cp.removeImage')}
                  title={t('cp.removeImage')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          value={text}
          aria-label={t('cp.input')}
          placeholder={
            waiting ? t('cp.waitingPlaceholder') : busy ? t('cp.queuePlaceholder') : t('cp.placeholderPlain')
          }
          onChange={(e) => updateText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
            if (files.length > 0) {
              e.preventDefault()
              addImages(files)
            }
          }}
          onKeyDown={(e) => {
            const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
            if (native.isComposing || native.keyCode === 229) return
            if (slashMatches.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashSel((value) => Math.min(value + 1, slashMatches.length - 1))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashSel((value) => Math.max(value - 1, 0))
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
                setFileSel((value) => Math.min(value + 1, fileMatches.length - 1))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setFileSel((value) => Math.max(value - 1, 0))
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
        />

        <div className="composer-bar">
          <AttachMenu onPickImage={() => fileRef.current?.click()} onReferenceFile={referenceFile} />
          {sendControl && <ModeMenu send={sendControl} disabled={conn !== 'open' || !settings} />}
          <div className="composer-right">
            {(busy || waiting) && (
              <button
                className="icon-btn"
                onClick={onInterrupt}
                aria-label={t('cp.stop')}
                title={`${t('cp.stop')} (Esc)`}
                style={{ color: 'var(--color-danger)' }}
              >
                <IconStop width={15} height={15} />
              </button>
            )}
            <ModelMenu
              send={sendControl ?? (() => undefined)}
              onAddConnection={() => onAddConnection?.()}
              onNewSession={onNewSession}
            />
            <button
              className="send-btn"
              onClick={submit}
              disabled={blocked}
              aria-label={busy ? t('cp.queueSend') : t('cp.send')}
              title={busy ? t('cp.queueSend') : `${t('cp.send')} (Enter)`}
            >
              <IconArrowUp width={17} height={17} />
            </button>
          </div>
        </div>
      </div>

      {!settingsReady && (
        <p className="composer-note" role="status">
          {t('cp.loadingSettings')}
        </p>
      )}
      {settingsReady && !hasConnection && (
        <div className="composer-note warn" role="status">
          <IconWarn width={13} height={13} />
          <span>{t('cp.needConnectionHint')}</span>
          {onAddConnection && (
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onAddConnection}>
              {t('cp.connect')}
            </button>
          )}
        </div>
      )}
      {waiting && (
        <p className="composer-note" role="status">
          {t('cp.waiting')}
        </p>
      )}
      {conn !== 'open' && <p className="composer-note">{t('cp.draftKept')}</p>}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
