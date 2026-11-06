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

export const IconArrowUp = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19V5M12 5 6 11M12 5l6 6" />
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

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 4 6.5v5.2c0 4.7 7.8 8.1 8 8.2.2-.1 8-3.5 8-8.2V6.5L12 3Z" />
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

export const IconFolder = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)

export const IconFile = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
)

export const IconImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" />
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

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
  </svg>
)

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />
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

export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const IconFolderPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
    <path d="M12 11v6M9 14h6" />
  </svg>
)

export const IconSliders = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </svg>
)

export const IconMore = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

export const IconBroom = (p: P) => (
  <svg {...base(p)}>
    <path d="m18 3 3 3-9 9H9v-3l9-9Z" />
    <path d="m3 21 6-6" />
    <path d="m8 18 3 3" />
  </svg>
)

export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 3 21 8l-4 4-1 6-4-4-5 5-2-2 5-5-4-4 6-1 4-4Z" />
    <path d="m9 15-5 5" />
  </svg>
)


export const IconList = (p: P) => (
  <svg {...base(p)}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth={2} />
    <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth={2} />
    <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth={2} />
  </svg>
)

export const IconCheckSquare = (p: P) => (
  <svg {...base(p)}>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)

export const IconDiffUnified = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="7" y1="9" x2="17" y2="9" />
    <line x1="7" y1="13" x2="17" y2="13" />
    <line x1="7" y1="17" x2="13" y2="17" />
  </svg>
)

export const IconDiffSplit = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="6" y1="9" x2="9" y2="9" />
    <line x1="6" y1="13" x2="9" y2="13" />
    <line x1="15" y1="9" x2="18" y2="9" />
    <line x1="15" y1="13" x2="18" y2="13" />
  </svg>
)

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
)

export const IconZap = (p: P) => (
  <svg {...base(p)}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

export const IconFlame = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

export const IconCpu = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="15" x2="23" y2="15" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="15" x2="4" y2="15" />
  </svg>
)

export const IconFileCode = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m10 13-2 2 2 2" />
    <path d="m14 17 2-2-2-2" />
  </svg>
)

export const IconQuote = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1 0 2-1.5 4-4 5v2Z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1 0 2-1.5 4-4 5v2Z" />
  </svg>
)

/** Shared personal brand, copied unchanged from my-portfolio/public/brand. */
export function BrandMark({ size = 32 }: { size?: number; uid?: string }) {
  return <span className="tc-brand-mark" style={{ width: size, height: size }}><img src="/brand/timecraker-mark-v1.svg" width={size} height={size} alt="TC" /></span>
}
export function SectionIcon({ name, ...props }: P & { name: string }) {
  const paths: Record<string,string> = {
    general: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
    connection: 'M5 6c0-4 14-4 14 0s-14 4-14 0v12c0 4 14 4 14 0V6M5 12c0 4 14 4 14 0',
    permission: 'M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Z',
    skill: 'm3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5',
    command: 'm5 5 7 7-7 7m9 0h6',
    rule: 'M5 3h9l5 5v13H5V3Zm9 0v6h5M8 13h8m-8 4h6',
    mcp: 'm14 7 3-3 3 3-3 3M10 17l-3 3-3-3 3-3m3 0 4-4',
    hooks: 'm10 8 2-2a4 4 0 0 1 6 6l-2 2m-2 2-2 2a4 4 0 0 1-6-6l2-2m1 5 6-6',
    about: 'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    panel: 'M3 4h18v16H3V4Zm5 0v16',
  }
  return <svg {...base(props)} aria-hidden="true"><path d={paths[name] ?? paths.rule} /></svg>
}
