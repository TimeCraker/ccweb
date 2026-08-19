import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { IconWarn } from './Icon'

/**
 * 全局错误 Toast:server error 消息此前静默(审查发现的缺口 #1)。
 * 4 秒自动消失,可手动关。
 */
export default function Toast() {
  const error = useStore((s) => s.error)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!error) return
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      useStore.getState().setError(null)
    }, 4000)
    return () => clearTimeout(t)
  }, [error])

  if (!error || !visible) return null

  return (
    <div className="animate-pop-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2" role="alert">
      <div className="flex max-w-md items-center gap-2.5 rounded-xl border border-danger/40 bg-panel px-4 py-2.5 shadow-2xl">
        <IconWarn width={15} height={15} className="shrink-0 text-danger" />
        <p className="min-w-0 flex-1 truncate text-xs text-text-dim" title={error}>
          {error}
        </p>
        <button
          onClick={() => {
            setVisible(false)
            useStore.getState().setError(null)
          }}
          aria-label="dismiss"
          className="shrink-0 text-text-faint hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
