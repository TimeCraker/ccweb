import React, { useCallback, useRef, useState } from 'react'

export function initDrawerWidth() {
  try {
    const saved = localStorage.getItem('ccweb.drawerW')
    if (saved) {
      const num = parseInt(saved, 10)
      if (!isNaN(num) && num >= 340 && num <= 1200) {
        document.documentElement.style.setProperty('--drawer-w', `${num}px`)
      }
    }
  } catch {
    // ignore
  }
}

export default function DrawerResizer() {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(460)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    document.body.classList.add('is-resizing-drawer')
    startX.current = e.clientX
    const computed = window.getComputedStyle(document.documentElement).getPropertyValue('--drawer-w')
    startWidth.current = parseInt(computed, 10) || 460

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = startX.current - moveEvt.clientX
      const maxW = Math.min(window.innerWidth * 0.8, 960)
      const clamped = Math.max(340, Math.min(maxW, startWidth.current + delta))
      document.documentElement.style.setProperty('--drawer-w', `${clamped}px`)
    }

    const onMouseUp = (upEvt: MouseEvent) => {
      setDragging(false)
      document.body.classList.remove('is-resizing-drawer')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const delta = startX.current - upEvt.clientX
      const maxW = Math.min(window.innerWidth * 0.8, 960)
      const clamped = Math.max(340, Math.min(maxW, startWidth.current + delta))
      try {
        localStorage.setItem('ccweb.drawerW', String(Math.round(clamped)))
      } catch {
        // ignore
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleDoubleClick = useCallback(() => {
    document.documentElement.style.setProperty('--drawer-w', '460px')
    try {
      localStorage.removeItem('ccweb.drawerW')
    } catch {
      // ignore
    }
  }, [])

  return (
    <div
      className={`drawer-resizer ${dragging ? 'is-dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title="拖拽调整面板宽度（双击复位默认 460px）"
      aria-label="拖拽调整面板宽度"
    />
  )
}
