import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const listeners = new Set<() => void>()

function readInitial(): Theme {
  const saved = localStorage.getItem('ccweb.theme')
  if (saved === 'dark' || saved === 'light') {
    applyClass(saved)
    return saved
  }
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
  const initial: Theme = prefersLight ? 'light' : 'dark'
  applyClass(initial)
  return initial
}

function applyClass(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

let current: Theme = readInitial()

export function setTheme(theme: Theme): void {
  current = theme
  localStorage.setItem('ccweb.theme', theme)
  applyClass(theme)
  for (const cb of listeners) cb()
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
