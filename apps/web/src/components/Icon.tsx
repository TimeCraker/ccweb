/**
 * ccweb 图标系统 —— 24×24 / stroke 1.5 / round caps(Phosphor 气质,内联零依赖)。
 * 替换早期字符图标($ ◉ ✎),消除廉价感。
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function base(props: P) {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }
}

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconChat = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
  </svg>
)

export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
)

export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
  </svg>
)

export const IconStop = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const IconWarn = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const IconTerminal = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 17 6-6-6-6M12 19h8" />
  </svg>
)

export const IconFile = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
)

export const IconEdit = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)

export const IconFork = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9M12 12v3" />
  </svg>
)

export const IconPencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

export const IconBrain = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5a3 3 0 1 0-5.9.8 3 3 0 0 0-1.9 5.4A3 3 0 0 0 6 17a3 3 0 0 0 6 1M12 5a3 3 0 1 1 5.9.8 3 3 0 0 1 1.9 5.4A3 3 0 0 1 18 17a3 3 0 0 1-6 1M12 5v14" />
  </svg>
)

export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </svg>
)

export const IconGauge = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 14 4-4M3.3 17a9 9 0 1 1 17.4 0" />
  </svg>
)

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

/**
 * 品牌徽标 —— 概念:C 形轨道环抱一枚终端光标。
 * Web 壳(弧)包裹 AI 核心(光标);多层深度:深空底板 + 金属弧光 + 发光光标。
 * 多实例共存:渐变 id 加实例后缀避免 SVG 冲突。
 */
export function BrandMark({ size = 24, uid = 'a' }: { size?: number; uid?: string }) {
  const p = (n: string) => `${n}-${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id={p('plate')} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#283058" />
          <stop offset="1" stopColor="#131834" />
        </linearGradient>
        <linearGradient id={p('arc')} x1="10" y1="10" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b9c2ff" />
          <stop offset="0.55" stopColor="#7c88f4" />
          <stop offset="1" stopColor="#4a53c9" />
        </linearGradient>
        <radialGradient id={p('glow')} cx="0.78" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#aab4ff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#8b96ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={p('cursor')} x1="24" y1="16" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2f4ff" />
          <stop offset="1" stopColor="#c4ccff" />
        </linearGradient>
      </defs>

      {/* 底板:深空渐变 + 顶部内高光 */}
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill={`url(#${p('plate')})`} />
      <rect
        x="2.5"
        y="2.5"
        width="35"
        height="35"
        rx="9.5"
        stroke="#ffffff"
        strokeOpacity="0.1"
        fill="none"
      />

      {/* C 形轨道:缺口右上,金属渐变弧 */}
      <path
        d="M26.5 14a9.5 9.5 0 1 0 0 12"
        stroke={`url(#${p('arc')})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* 终端光标:C 开口处的发光圆角方块 */}
      <circle cx="27" cy="20" r="7" fill={`url(#${p('glow')})`} />
      <rect x="24.6" y="17.6" width="4.8" height="4.8" rx="1.3" fill={`url(#${p('cursor')})`} />
    </svg>
  )
}

/** favicon 数据 URI(与 BrandMark 同款,内联进 index.html) */
export const FAVICON_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none"><defs><linearGradient id="p" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#283058"/><stop offset="1" stop-color="#131834"/></linearGradient><linearGradient id="a" x1="10" y1="10" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b9c2ff"/><stop offset=".55" stop-color="#7c88f4"/><stop offset="1" stop-color="#4a53c9"/></linearGradient><radialGradient id="g" cx=".78" cy=".5" r=".5"><stop offset="0" stop-color="#aab4ff" stop-opacity=".85"/><stop offset="1" stop-color="#8b96ff" stop-opacity="0"/></radialGradient></defs><rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill="url(#p)"/><rect x="2.5" y="2.5" width="35" height="35" rx="9.5" stroke="#fff" stroke-opacity=".1"/><path d="M26.5 14a9.5 9.5 0 1 0 0 12" stroke="url(#a)" stroke-width="3.4" stroke-linecap="round"/><circle cx="27" cy="20" r="7" fill="url(#g)"/><rect x="24.6" y="17.6" width="4.8" height="4.8" rx="1.3" fill="#e8ecff"/></svg>`,
  )
