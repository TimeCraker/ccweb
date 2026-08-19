import { useSyncExternalStore } from 'react'

/** 主题三态(dsh 对齐):dark / light / system(跟随系统,实时响应变化) */
export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const listeners = new Set<() => void>()

function systemPrefers(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readInitial(): ThemeMode {
  const saved = localStorage.getItem('ccweb.theme')
  if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
  return 'system'
}

function applyClass(mode: ThemeMode): ResolvedTheme {
  const resolved = mode === 'system' ? systemPrefers() : mode
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

let current: ThemeMode = readInitial()
let resolved: ResolvedTheme = applyClass(current)

// system 模式下跟随系统实时变化
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (current === 'system') resolved = applyClass('system')
  for (const cb of listeners) cb()
})

export function setTheme(mode: ThemeMode): void {
  current = mode
  localStorage.setItem('ccweb.theme', mode)
  resolved = applyClass(mode)
  for (const cb of listeners) cb()
}

/** 循环切换:dark → light → system → dark */
export function cycleTheme(): void {
  setTheme(current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark')
}

export function useThemeMode(): { mode: ThemeMode; resolved: ResolvedTheme } {
  const mode = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
  return { mode, resolved }
}

/** 兼容旧用法 */
export function useTheme(): ResolvedTheme {
  return useThemeMode().resolved
}
