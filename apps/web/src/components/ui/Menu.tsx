/**
 * 统一菜单 / 弹层原语。
 * 行为契约(与 UX Spec 第 8 节一致):
 * - 非模态:点击外部关闭、Esc 关闭并回焦到触发按钮、Tab 离开关闭;
 * - 同级互斥:同时只允许一个菜单打开(全局 active 注册);
 * - 视口避让:空间不足向上翻转,横向夹紧,超高时内部滚动,不被 overflow 截断;
 * - 键盘可达:面板获得焦点,方向键 / Home / End 在菜单项间移动,Enter 由原生 button 触发。
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

let activeId: symbol | null = null
const listeners = new Set<(id: symbol | null) => void>()
function broadcast(id: symbol | null) {
  activeId = id
  for (const listener of listeners) listener(id)
}

interface MenuProps {
  /** 无障碍名称:面板 role=menu 的 aria-label */
  label: string
  trigger: (state: { open: boolean }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  /** 期望宽度(px),实际会被视口夹紧 */
  width?: number
  className?: string
  /** 打开时额外回调(例如触发搜索) */
  onOpen?: () => void
}

export function Menu({
  label,
  trigger,
  children,
  align = 'start',
  width = 260,
  className,
  onOpen,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const self = useRef<symbol>(Symbol(label))
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const focusPending = useRef(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (activeId === self.current) broadcast(null)
    if (restoreFocus) restoreTo.current?.focus?.()
  }, [])

  // 同级互斥:其他菜单打开时关闭自己
  useEffect(() => {
    const listener = (current: symbol | null) => {
      if (current !== self.current) setOpen(false)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (activeId === self.current) broadcast(null)
    }
  }, [])

  const place = useCallback(() => {
    const el = anchor.current
    const panelEl = panel.current
    if (!el || !panelEl) return
    const rect = el.getBoundingClientRect()
    const widthPx = Math.min(width, window.innerWidth - 16)
    const height = panelEl.offsetHeight
    const gap = 6
    const below = window.innerHeight - rect.bottom - gap - 10
    const above = rect.top - gap - 10
    const flipUp = height > below && above > below
    let left = align === 'end' ? rect.right - widthPx : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - widthPx - 8))
    const maxHeight = Math.max(160, Math.min(480, flipUp ? above : below))
    const top = flipUp
      ? Math.max(8, rect.top - Math.min(height, maxHeight) - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - 12 - Math.min(height, maxHeight))
    setPos({ left, top, maxHeight })
  }, [align, width])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
    focusPending.current = true
    // 内容高度变化(过滤列表等)后重新避让
    const observer = new ResizeObserver(() => place())
    if (panel.current) observer.observe(panel.current)
    return () => observer.disconnect()
  }, [open, place])

  // 定位完成后才真正可见;此时再聚焦,避免对 visibility:hidden 元素 focus 失败
  useEffect(() => {
    if (!open || !pos || !focusPending.current) return
    focusPending.current = false
    const focusTarget = panel.current?.querySelector<HTMLElement>('input, [data-autofocus]') ?? panel.current
    focusTarget?.focus({ preventScroll: true })
  }, [open, pos])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return
      close(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close(true)
      }
    }
    const onReposition = () => place()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, close, place])

  const toggle = () => {
    if (open) {
      close(false)
      return
    }
    restoreTo.current = document.activeElement as HTMLElement | null
    broadcast(self.current)
    setOpen(true)
    onOpen?.()
  }

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const target = event.target as HTMLElement
    // 输入框内的 Home/End/方向键属于文本编辑,不能被菜单导航截获
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]',
      ) ?? [],
    ).filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
    if (items.length === 0) return
    const active = document.activeElement as HTMLElement
    const index = items.indexOf(active)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
    }
    // Tab/Shift+Tab 交给浏览器:焦点真正离开面板时由 onBlur 关闭
  }

  return (
    <>
      <span ref={anchor} className="inline-flex" onClick={toggle}>
        {trigger({ open })}
      </span>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null
              if (next && panel.current?.contains(next)) return
              close(false)
            }}
            className={`menu ${className ?? ''}`}
            style={{
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              width: Math.min(width, Math.max(0, (window.innerWidth ?? 1024) - 16)),
              maxHeight: pos?.maxHeight ?? 460,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {children(() => close(true))}
          </div>,
          document.body,
        )}
    </>
  )
}

/** 菜单项:selected 用于单选组(aria-checked) */
export function MenuItem({
  children,
  onClick,
  selected,
  disabled,
  description,
  aside,
  danger,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  description?: ReactNode
  aside?: ReactNode
  danger?: boolean
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`menu-item ${danger ? 'danger' : ''}`}
    >
      {icon}
      <span className="menu-body">
        <strong>{children}</strong>
        {description && <small>{description}</small>}
      </span>
      {aside && <span className="menu-aside">{aside}</span>}
      {selected && <CheckMark />}
    </button>
  )
}

function CheckMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto', marginTop: 2 }}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * 模态原语:遮罩点击 / Esc 关闭,焦点陷阱与回焦,背景滚动锁定。
 */
export function Modal({
  label,
  onClose,
  children,
  className,
  canDismiss,
}: {
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** 有未保存草稿时返回 false:遮罩/Esc 不直接丢弃 */
  canDismiss?: () => boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  // 回调走 ref:避免父组件每次渲染生成新函数导致焦点/滚动锁 effect 反复重建
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const canDismissRef = useRef(canDismiss)
  canDismissRef.current = canDismiss

  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    box.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!canDismissRef.current || canDismissRef.current()) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !box.current) return
      const items = Array.from(
        box.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = previousOverflow
      restore.current?.focus?.()
    }
  }, [])

  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (!canDismissRef.current || canDismissRef.current()) closeRef.current()
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`modal ${className ?? ''}`}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}
