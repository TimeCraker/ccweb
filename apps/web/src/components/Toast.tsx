import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconWarn, IconCheck, IconX } from './Icon'

/**
 * 全局反馈:错误走红色 toast,普通提示走中性 toast。
 * 4 秒自动消失,可手动关;两者互斥显示(先到的先显示)。
 */
export default function Toast() {
  const error = useStore((s) => s.error)
  const notice = useStore((s) => s.notice)
  const [visible, setVisible] = useState(false)
  useLocale()

  const message = error ?? notice
  const isError = Boolean(error)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
      const state = useStore.getState()
      if (state.error === message) state.setError(null)
      if (state.notice === message) state.setNotice(null)
    }, isError ? 6000 : 3600)
    return () => clearTimeout(timer)
  }, [message, isError])

  if (!message || !visible) return null

  return (
    <div className={`toast ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>
      {isError ? (
        <IconWarn width={15} height={15} style={{ flex: '0 0 auto' }} />
      ) : (
        <IconCheck width={15} height={15} style={{ flex: '0 0 auto', color: 'var(--color-ok)' }} />
      )}
      <p style={{ minWidth: 0, flex: 1, margin: 0 }} title={message}>
        {message}
      </p>
      <button
        className="toast-close"
        onClick={() => {
          setVisible(false)
          const state = useStore.getState()
          if (state.error) state.setError(null)
          if (state.notice) state.setNotice(null)
        }}
        aria-label={t('err.dismiss')}
      >
        <IconX width={12} height={12} />
      </button>
    </div>
  )
}
