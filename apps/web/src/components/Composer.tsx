import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { IconArrowUp, IconStop, IconFile, IconWarn, IconSparkle, IconX, IconChevron } from './Icon'
import { AttachMenu, ModelMenu, ModeMenu } from './RunMenus'
import { Menu } from './ui/Menu'
import Lightbox from './Lightbox'

const EMPTY_SKILLS: Array<{ name: string; description?: string }> = []

interface UserCommand {
  id: string
  title: string
  prompt: string
  isSkill?: boolean
}

const DEFAULT_USER_COMMANDS: UserCommand[] = [
  { id: 'cmd-review', title: '代码审查 Diff', prompt: '/review 审查本次代码变更质量与潜在风险' },
  { id: 'cmd-plan', title: '进入规划模式', prompt: '/plan 分析需求并拟定实施计划' },
  { id: 'cmd-compact', title: '精简上下文', prompt: '/compact' },
  { id: 'cmd-test', title: '运行项目体检', prompt: '运行当前自动化测试并排查失败用例' },
]

function getUserCommands(): UserCommand[] {
  try {
    const raw = localStorage.getItem('ccweb.user_commands')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    // 兼容旧版本 custom_snippets
    const oldRaw = localStorage.getItem('ccweb.custom_snippets')
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw)
      if (Array.isArray(oldParsed) && oldParsed.length > 0) {
        return oldParsed.map((it: { title: string; prompt: string }, idx: number) => ({
          id: `legacy-${idx}`,
          title: it.title || it.prompt.slice(0, 16),
          prompt: it.prompt,
        }))
      }
    }
    return DEFAULT_USER_COMMANDS
  } catch {
    return DEFAULT_USER_COMMANDS
  }
}

function CommandsMenu({
  onSelectCommand,
  currentText,
}: {
  onSelectCommand: (cmd: string) => void
  currentText: string
}) {
  const settings = useStore((s) => s.settings)
  const skills = settings?.skills ?? EMPTY_SKILLS
  const [filterQuery, setFilterQuery] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPrompt, setNewPrompt] = useState('')

  const [commands, setCommands] = useState<UserCommand[]>(getUserCommands)

  const persistCommands = (next: UserCommand[]) => {
    setCommands(next)
    try {
      localStorage.setItem('ccweb.user_commands', JSON.stringify(next))
      window.dispatchEvent(new Event('ccweb:commands-updated'))
    } catch {
      // ignore
    }
  }

  const handleSaveCurrentInput = (closeMenu: () => void) => {
    const trimmed = currentText.trim()
    if (!trimmed) return
    const title = trimmed.replace(/^[\s#*>`-]+/, '').slice(0, 18) + (trimmed.length > 18 ? '…' : '')
    const newCmd: UserCommand = {
      id: `cmd-${Date.now()}`,
      title,
      prompt: trimmed,
    }
    const next = [newCmd, ...commands.filter((c) => c.prompt !== trimmed)].slice(0, 30)
    persistCommands(next)
    useStore.getState().setNotice(`已保存常用指令「${title}」`)
    closeMenu()
  }

  const handleCreateNewCommand = () => {
    const t = newTitle.trim() || newPrompt.trim().slice(0, 16)
    const p = newPrompt.trim()
    if (!p) return
    const newCmd: UserCommand = {
      id: `cmd-${Date.now()}`,
      title: t,
      prompt: p,
    }
    persistCommands([newCmd, ...commands])
    setNewTitle('')
    setNewPrompt('')
    setIsAddingNew(false)
    useStore.getState().setNotice(`已添加指令「${t}」`)
  }

  const handleDeleteCommand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = commands.filter((c) => c.id !== id)
    persistCommands(next)
    useStore.getState().setNotice('已移除该指令')
  }

  const q = filterQuery.toLowerCase().trim()
  const filteredUserCmds = commands.filter(
    (c) => !q || c.title.toLowerCase().includes(q) || c.prompt.toLowerCase().includes(q),
  )
  const filteredSkills = skills.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)),
  )

  return (
    <Menu
      label="快捷指令与技能"
      align="start"
      width={360}
      trigger={({ open }) => (
        <button
          type="button"
          className={`chip-btn ${open ? 'is-active' : ''}`}
          aria-expanded={open}
          title="点击使用我常用的指令与技能"
          style={{ gap: 5, padding: '0 8px' }}
        >
          <IconSparkle width={13} height={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="chip-label" style={{ fontWeight: 500 }}>快捷指令</span>
          <IconChevron width={11} height={11} style={{ opacity: 0.6 }} />
        </button>
      )}
    >
      {(close) => (
        <div className="snippets-menu-panel" style={{ width: 350, maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
          <div className="snippets-menu-head" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>
                常用指令与已安装技能
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, height: 22, padding: '0 6px', color: 'var(--color-accent)' }}
                onClick={() => setIsAddingNew((v) => !v)}
              >
                {isAddingNew ? '取消' : '+ 新增指令'}
              </button>
            </div>
            <input
              type="text"
              className="input"
              placeholder="快速搜索指令或技能…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', height: 26, borderRadius: 5 }}
            />
          </div>

          {isAddingNew && (
            <div style={{ padding: 10, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <input
                type="text"
                className="input"
                placeholder="指令标题 (如: 代码审查)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', marginBottom: 6 }}
              />
              <textarea
                className="input"
                placeholder="输入具体 Prompt 指令内容…"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={2}
                style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', marginBottom: 6, resize: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, height: 24 }}
                  onClick={() => setIsAddingNew(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: 11, height: 24 }}
                  disabled={!newPrompt.trim()}
                  onClick={handleCreateNewCommand}
                >
                  保存指令
                </button>
              </div>
            </div>
          )}

          <div className="snippets-list" style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            <div className="snippets-divider" style={{ marginTop: 2, marginBottom: 4 }}>
              我的常用指令 ({filteredUserCmds.length})
            </div>

            {filteredUserCmds.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 11.5 }}>
                {filterQuery ? '未找到匹配的指令' : '暂无常用指令，可点击上方「新增指令」'}
              </div>
            ) : (
              filteredUserCmds.map((cmd) => (
                <div
                  key={cmd.id}
                  className="snippet-item custom"
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => {
                    onSelectCommand(cmd.prompt)
                    close()
                  }}
                  title="点击填入输入框"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="snippet-title" style={{ fontWeight: 550, fontSize: 12, color: 'var(--color-text)' }}>
                      {cmd.title}
                    </div>
                    <div className="snippet-desc" style={{ fontSize: 11, color: 'var(--color-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cmd.prompt}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn snippet-del-btn"
                    onClick={(e) => handleDeleteCommand(cmd.id, e)}
                    title="删除此常用指令"
                    style={{ opacity: 0.5, flexShrink: 0 }}
                  >
                    <IconX width={11} height={11} />
                  </button>
                </div>
              ))
            )}

            {filteredSkills.length > 0 && (
              <>
                <div className="snippets-divider" style={{ marginTop: 10, marginBottom: 4 }}>
                  已安装技能 (SKILLS: {filteredSkills.length})
                </div>
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    className="snippet-item"
                    onClick={() => {
                      onSelectCommand(`/${skill.name} `)
                      close()
                    }}
                    style={{ width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6 }}
                  >
                    <div className="snippet-title" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: 12 }}>
                      /{skill.name}
                    </div>
                    {skill.description && (
                      <div className="snippet-desc" style={{ fontSize: 11, color: 'var(--color-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {skill.description}
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          {currentText.trim().length > 0 && (
            <div className="snippets-menu-foot" style={{ padding: '6px 10px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-surface)' }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', justifyContent: 'center' }}
                onClick={() => handleSaveCurrentInput(close)}
              >
                + 保存当前输入为常用指令
              </button>
            </div>
          )}
        </div>
      )}
    </Menu>
  )
}

interface LastSendState {
  signature: string
  at: number
  acknowledged: boolean
}

const PROMPT_HISTORY_KEY = 'ccweb.promptHistory'
const MAX_PROMPT_HISTORY = 50

function loadPromptHistory(): string[] {
  try {
    const raw = localStorage.getItem(PROMPT_HISTORY_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    }
  } catch {
    // ignore
  }
  return []
}

function appendPromptHistory(item: string) {
  const trimmed = item.trim()
  if (!trimmed) return
  try {
    const current = loadPromptHistory()
    const next = [trimmed, ...current.filter((x) => x !== trimmed)].slice(0, MAX_PROMPT_HISTORY)
    localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** 最近一次成功发送:放在模块级,避免空态→对话态切换导致 Composer 重挂载后丢失 */

const DEFAULT_SLASH_COMMANDS = [
  { name: 'compact', description: '压缩精简上下文，释放空间' },
  { name: 'plan', description: '进入规划模式，先拟定实施步骤' },
  { name: 'bug', description: '系统化定位与诊断当前代码问题' },
  { name: 'clear', description: '清空历史，开始新会话' },
  { name: 'review', description: '全面审查当前代码改动与质量' },
  { name: 'files', description: '查看工作区源码文件树与代码预览' },
  { name: 'tasks', description: '查看后台任务与系统运行指标' },
  { name: 'cost', description: '查看 Token 消耗与用量统计' },
  { name: 'init', description: '初始化或审计项目工程规范 (CLAUDE.md)' },
  { name: 'model', description: '查看或切换当前 AI 模型配置' },
]

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
  const [historyIdx, setHistoryIdx] = useState(-1)
  const draftBeforeHistory = useRef('')
  const slashListRef = useRef<HTMLDivElement>(null)
  const fileListRef = useRef<HTMLDivElement>(null)
  const isKeyNavRef = useRef(false)
  const keyNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userCommands, setUserCommands] = useState<UserCommand[]>(getUserCommands)
  useEffect(() => {
    const onUpdated = () => setUserCommands(getUserCommands())
    window.addEventListener('ccweb:commands-updated', onUpdated)
    return () => window.removeEventListener('ccweb:commands-updated', onUpdated)
  }, [])

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
    setHistoryIdx(-1)
  }, [key])

  const updateText = (value: string, fromHistory = false) => {
    if (!activeCommand && value.startsWith('/')) {
      const match = value.match(/^\/([a-zA-Z0-9_-]+)\s+(.*)$/)
      if (match && match[1]) {
        const cmdName = match[1]
        const param = match[2] ?? ''
        setActiveCommand({ name: cmdName })
        setText(param)
        localStorage.setItem(key, param)
        if (!fromHistory) setHistoryIdx(-1)
        return
      }
    }
    setText(value)
    localStorage.setItem(key, value)
    if (!fromHistory) {
      setHistoryIdx(-1)
    }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (typeof customEvent.detail === 'string') {
        const insertion = customEvent.detail
        setText((curr) => {
          let next = ''
          const trimmed = curr.trim()
          if (!trimmed || trimmed === '/') {
            next = insertion
          } else if (insertion.startsWith('/') && trimmed.startsWith('/')) {
            next = insertion
          } else if (insertion.includes('\n')) {
            next = `${curr.trimEnd()}\n\n${insertion}`
          } else {
            next = curr.endsWith(' ') ? `${curr}${insertion}` : `${curr} ${insertion}`
          }
          next = next.replace(/^\/\/+/, '/')
          localStorage.setItem(key, next)
          return next
        })
        setTimeout(() => {
          if (taRef.current) {
            taRef.current.focus()
            taRef.current.scrollTop = taRef.current.scrollHeight
          }
        }, 50)
      }
    }

    const quoteHandler = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang?: string; code?: string }>
      if (customEvent.detail && typeof customEvent.detail.code === 'string') {
        const { lang = '', code } = customEvent.detail
        const formatted = `\`\`\`${lang}\n${code}\n\`\`\``
        setText((curr) => {
          let next = ''
          if (!curr.trim()) {
            next = formatted
          } else {
            next = `${curr.trimEnd()}\n\n${formatted}`
          }
          localStorage.setItem(key, next)
          return next
        })
        useStore.getState().setNotice('已将代码片段引用至提问输入框')
        setTimeout(() => {
          if (taRef.current) {
            taRef.current.focus()
            taRef.current.scrollTop = taRef.current.scrollHeight
          }
        }, 50)
      }
    }

    const editHandler = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (typeof customEvent.detail === 'string') {
        const promptToEdit = customEvent.detail
        updateText(promptToEdit)
        useStore.getState().setNotice('已将提问回填至输入框')
        setTimeout(() => {
          if (taRef.current) {
            taRef.current.focus()
            taRef.current.selectionStart = taRef.current.selectionEnd = promptToEdit.length
            taRef.current.scrollTop = taRef.current.scrollHeight
          }
        }, 50)
      }
    }

    window.addEventListener('ccweb:insert-prompt', handler)
    window.addEventListener('ccweb:edit-prompt', editHandler)
    window.addEventListener('ccweb:quote-code', quoteHandler)
    return () => {
      window.removeEventListener('ccweb:insert-prompt', handler)
      window.removeEventListener('ccweb:edit-prompt', editHandler)
      window.removeEventListener('ccweb:quote-code', quoteHandler)
    }
  }, [key])
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
  const [activeCommand, setActiveCommand] = useState<{ name: string; description?: string } | null>(null)
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
  const userSkills = useStore((s) => s.settings?.skills)
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

  /** 斜杠命令补全:输入以 / 开头(且仅首词且未敲空格)时弹出过滤列表 */
  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || text.includes('\n') || text.slice(1).includes(' ')) return []
    const word = text.slice(1).toLowerCase()

    interface SlashItem {
      name: string
      description: string
      prompt?: string
    }

    const userCmds: SlashItem[] = userCommands.map((cmd) => {
      const slashCmdMatch = cmd.prompt.match(/^\/([a-zA-Z0-9_-]+)/)
      const cmdName = (slashCmdMatch && slashCmdMatch[1] ? slashCmdMatch[1] : cmd.title.replace(/\s+/g, '-').toLowerCase()) || 'cmd'
      return {
        name: cmdName,
        description: `(自定义) ${cmd.title}`,
        prompt: cmd.prompt,
      }
    })

    const customSkills: SlashItem[] = (userSkills ?? []).map((sk) => ({
      name: sk.name,
      description: sk.description ? `(Skill) ${sk.description}` : '(Skill) 用户自定义技能',
      prompt: undefined,
    }))
    const all: SlashItem[] = [
      ...userCmds,
      ...slashCommands.map((c) => ({ name: c.name, description: c.description, prompt: undefined })),
      ...DEFAULT_SLASH_COMMANDS.filter((d) => !slashCommands.some((c) => c.name === d.name)).map((c) => ({
        name: c.name,
        description: c.description,
        prompt: undefined,
      })),
      ...customSkills.filter(
        (sk) => !DEFAULT_SLASH_COMMANDS.some((d) => d.name === sk.name) && !slashCommands.some((c) => c.name === sk.name),
      ),
    ]
    return all
      .filter((command) => command.name.toLowerCase().includes(word) || command.description.toLowerCase().includes(word))
      .slice(0, 12)
  }, [text, slashCommands, userSkills, userCommands])

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

  // 键盘上下键切换时，高亮项自动跟随滚动到可视区域内
  useEffect(() => {
    if (slashMatches.length > 0 && slashListRef.current) {
      const activeEl = slashListRef.current.querySelector<HTMLElement>('[data-active="true"]')
      if (activeEl) {
        requestAnimationFrame(() => {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      }
    }
  }, [slashSel, slashMatches.length])

  useEffect(() => {
    if (fileMatches.length > 0 && fileListRef.current) {
      const activeEl = fileListRef.current.querySelector<HTMLElement>('[data-active="true"]')
      if (activeEl) {
        requestAnimationFrame(() => {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      }
    }
  }, [fileSel, fileMatches.length])

  const effectiveText = activeCommand ? `/${activeCommand.name}${text.trim() ? ` ${text.trim()}` : ""}` : text.trim()
  const canSend = Boolean(effectiveText || images.length)
  const isBusyOrWaiting = busy || waiting
  const isStopMode = isBusyOrWaiting && !canSend
  const blocked = !settingsReady || !!pending || conn !== 'open' || waiting || !canSend

  const submit = () => {
    const fullText = activeCommand ? `/${activeCommand.name}${text.trim() ? ` ${text.trim()}` : ''}` : text.trim()
    if (!settingsReady || pending || conn !== 'open' || waiting || (!fullText && images.length === 0)) return
    const signature = `${fullText}|${images.length}:${images.reduce((sum, src) => sum + src.length, 0)}`
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
    const request = onSend(fullText || t('cp.imageOnly'), images.length ? images : undefined)
    if (request === 'local') {
      appendPromptHistory(fullText)
      setHistoryIdx(-1)
      updateText('')
      setActiveCommand(null)
      setImages([])
    } else if (request) {
      appendPromptHistory(fullText)
      setHistoryIdx(-1)
      lastSend = { signature, at: Date.now(), acknowledged: false }
      setPending(request)
      setActiveCommand(null)
    }
  }

  const pickSlash = (item: { name: string; description?: string; prompt?: string }) => {
    if (item.prompt && !item.prompt.startsWith('/')) {
      updateText(item.prompt)
    } else {
      const firstToken = item.prompt?.startsWith('/') ? item.prompt.replace(/^\/+/, '').split(/\s+/)[0] : item.name
      const clean = (firstToken ?? item.name).replace(/^\/+/, '')
      const rest = item.prompt?.startsWith('/') ? item.prompt.replace(/^\/+/, '').split(/\s+/).slice(1).join(' ') : ''
      setActiveCommand({ name: clean, description: item.description })
      updateText(rest ? `${rest} ` : '')
    }
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

  // 文本行数与字数检测，用于自适应行宽档位
  const lineCount = useMemo(() => {
    if (!text) return 1
    return text.split('\n').length
  }, [text])

  const composerWidthClass = useMemo(() => {
    if (lineCount >= 3 || text.length > 80) return 'composer-wide-max'
    if (lineCount === 2 || text.length > 35) return 'composer-wide-mid'
    return 'composer-wide-base'
  }, [lineCount, text.length])

  // 高度自适应：单行起步，最多自适应到六行（约 156px），超出六行开启平滑垂直滚动
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const targetH = Math.min(Math.max(el.scrollHeight, 38), 156)
    el.style.height = `${targetH}px`
    el.style.overflowY = el.scrollHeight > 156 ? 'auto' : 'hidden'
  }, [text])

  return (
    <div
      className={`composer ${composerWidthClass} ${hero ? 'composer-hero' : ''} ${dragging ? 'is-drag' : ''} ${isBusyOrWaiting ? 'is-busy-glow' : ''}`}
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
        <div ref={slashListRef} className="suggestions" role="listbox" aria-label="斜杠命令">
          {slashMatches.map((command, index) => (
            <button
              key={command.name}
              className="suggestion"
              data-active={index === slashSel}
              onMouseEnter={() => {
                if (!isKeyNavRef.current) setSlashSel(index)
              }}
              onClick={() => pickSlash(command)}
            >
              <span className="name">/{command.name}</span>
              <span className="desc">{command.description}</span>
            </button>
          ))}
        </div>
      )}
      {slashMatches.length === 0 && atQuery !== null && (
        <div ref={fileListRef} className="suggestions" role="listbox" aria-label={t('cp.attachFile')}>
          {fileMatches.length > 0 ? (
            fileMatches.map((file, index) => {
              const parts = file.split('/')
              const fileName = parts.pop() ?? file
              const fileDir = parts.join('/')
              return (
                <button
                  key={file}
                  className="suggestion"
                  data-active={index === fileSel}
                  onMouseEnter={() => {
                    if (!isKeyNavRef.current) setFileSel(index)
                  }}
                  onClick={() => pickFile(file)}
                >
                  <IconFile width={13} height={13} style={{ color: 'var(--color-accent)', flex: '0 0 auto' }} />
                  <span className="file-suggestion-name">{fileName}</span>
                  {fileDir && <span className="file-suggestion-dir">{fileDir}</span>}
                </button>
              )
            })
          ) : (
            <div className="suggestion-hint">
              <span>输入文件名进行工作区检索...</span>
            </div>
          )}
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

        <div className="composer-input-wrapper" style={{ position: 'relative', width: '100%' }}>
          {activeCommand && (
            <div className="composer-command-chip-container">
              <span className="composer-command-chip">
                <span className="chip-prefix">/</span>
                <span className="chip-name">{activeCommand.name}</span>
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => {
                    setActiveCommand(null)
                    taRef.current?.focus()
                  }}
                  title="移除命令 (Backspace)"
                  aria-label="移除命令"
                >
                  <IconX width={10} height={10} />
                </button>
              </span>
            </div>
          )}
          <textarea
            ref={taRef}
            value={text}
            aria-label={t('cp.input')}
            placeholder={
              activeCommand
                ? `为 /${activeCommand.name} 输入参数（可选），Enter 发送...`
                : waiting
                  ? t('cp.waitingPlaceholder')
                  : busy
                    ? t('cp.queuePlaceholder')
                    : hero
                      ? '向 Claude 提问，输入 @ 引用工作区文件，/ 快捷指令...'
                      : '输入提问，输入 @ 引用文件，/ 快捷指令... (Enter 发送)'
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
              if (e.key === 'Backspace' && text === '' && activeCommand) {
                e.preventDefault()
                setActiveCommand(null)
                return
              }
              if (slashMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  isKeyNavRef.current = true
                  if (keyNavTimerRef.current) clearTimeout(keyNavTimerRef.current)
                  keyNavTimerRef.current = setTimeout(() => {
                    isKeyNavRef.current = false
                  }, 250)
                  setSlashSel((value) => (value + 1) % slashMatches.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  isKeyNavRef.current = true
                  if (keyNavTimerRef.current) clearTimeout(keyNavTimerRef.current)
                  keyNavTimerRef.current = setTimeout(() => {
                    isKeyNavRef.current = false
                  }, 250)
                  setSlashSel((value) => (value - 1 + slashMatches.length) % slashMatches.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
                  e.preventDefault()
                  const sel = slashMatches[slashSel]
                  if (sel) pickSlash(sel)
                  return
                }
              } else if (fileMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  isKeyNavRef.current = true
                  if (keyNavTimerRef.current) clearTimeout(keyNavTimerRef.current)
                  keyNavTimerRef.current = setTimeout(() => {
                    isKeyNavRef.current = false
                  }, 250)
                  setFileSel((value) => (value + 1) % fileMatches.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  isKeyNavRef.current = true
                  if (keyNavTimerRef.current) clearTimeout(keyNavTimerRef.current)
                  keyNavTimerRef.current = setTimeout(() => {
                    isKeyNavRef.current = false
                  }, 250)
                  setFileSel((value) => (value - 1 + fileMatches.length) % fileMatches.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
                  e.preventDefault()
                  pickFile(fileMatches[fileSel] ?? fileMatches[0] ?? '')
                  return
                }
              } else {
                // 提示词历史回溯 (Prompt History): 输入框为空或光标在开头时按 ↑/↓ 翻阅
                if (e.key === 'ArrowUp') {
                  const isCursorAtStart = taRef.current
                    ? taRef.current.selectionStart === 0 && taRef.current.selectionEnd === 0
                    : true
                  if (text === '' || historyIdx >= 0 || isCursorAtStart) {
                    const history = loadPromptHistory()
                    if (history.length > 0) {
                      e.preventDefault()
                      if (historyIdx === -1) {
                        draftBeforeHistory.current = text
                      }
                      const nextIdx = Math.min(historyIdx + 1, history.length - 1)
                      setHistoryIdx(nextIdx)
                      const val = history[nextIdx] ?? ''
                      updateText(val, true)
                      setTimeout(() => {
                        if (taRef.current) {
                          taRef.current.selectionStart = taRef.current.selectionEnd = val.length
                        }
                      }, 0)
                      return
                    }
                  }
                } else if (e.key === 'ArrowDown' && historyIdx >= 0) {
                  e.preventDefault()
                  const history = loadPromptHistory()
                  const nextIdx = historyIdx - 1
                  setHistoryIdx(nextIdx)
                  if (nextIdx >= 0) {
                    const val = history[nextIdx] ?? ''
                    updateText(val, true)
                    setTimeout(() => {
                      if (taRef.current) {
                        taRef.current.selectionStart = taRef.current.selectionEnd = val.length
                      }
                    }, 0)
                  } else {
                    updateText(draftBeforeHistory.current, true)
                    setHistoryIdx(-1)
                  }
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                if (isBusyOrWaiting) {
                  e.preventDefault()
                  onInterrupt()
                } else if (text.trim().length > 0) {
                  e.preventDefault()
                  updateText('')
                }
              }
            }}
            rows={1}
          />
          {text.trim().length > 0 && (
            <button
              type="button"
              className="composer-textarea-clear-btn"
              onClick={() => {
                setActiveCommand(null)
                updateText('')
                taRef.current?.focus()
              }}
              title="清空草稿 (Esc)"
              aria-label="清空草稿"
            >
              <IconX width={11} height={11} />
            </button>
          )}
        </div>

        <div className="composer-bar">
          <AttachMenu onPickImage={() => fileRef.current?.click()} onReferenceFile={referenceFile} />
          <CommandsMenu
            currentText={text}
            onSelectCommand={(cmd) => {
              if (cmd.startsWith('/')) {
                const parts = cmd.replace(/^\/+/, '').split(/\s+/)
                const name = parts[0] ?? ''
                const rest = parts.slice(1).join(' ')
                if (name) setActiveCommand({ name })
                updateText(rest ? `${rest} ` : '')
              } else if (text.trim().length > 0) {
                updateText(`${text}\n\n${cmd}`)
              } else {
                updateText(cmd)
              }
              setTimeout(() => taRef.current?.focus(), 50)
            }}
          />
          {sendControl && <ModeMenu send={sendControl} disabled={conn !== 'open' || !settings} />}
          <div className="composer-right">
            {text.trim().length > 15 && (
              <span
                className="composer-char-count font-mono text-[10.5px] select-none text-text-faint/60 px-1.5"
                title={`${text.trim().length} 字符 · ${lineCount} 行`}
              >
                {text.trim().length} 字{lineCount > 1 ? ` · ${lineCount} 行` : ''}
              </span>
            )}
            <ModelMenu
              send={sendControl ?? (() => undefined)}
              onAddConnection={() => onAddConnection?.()}
              _onNewSession={onNewSession}
            />
            {isStopMode ? (
              <button
                className="send-btn stop"
                onClick={onInterrupt}
                aria-label={t('cp.stop')}
                title={`${t('cp.stop')} (Esc)`}
              >
                <IconStop width={15} height={15} />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={submit}
                disabled={blocked}
                aria-label={busy ? t('cp.queueSend') : t('cp.send')}
                title={busy ? t('cp.queueSend') : `${t('cp.send')} (Enter)`}
              >
                <IconArrowUp width={17} height={17} />
              </button>
            )}
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
