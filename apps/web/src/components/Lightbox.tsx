import { useEffect } from 'react'
import { t, useLocale } from '../i18n'

/**
 * 图片全屏预览:点击遮罩或 Esc 关闭。
 * 由附件缩略图点击进入,展示层组件自身不持有状态(父组件控制开关)。
 */
export default function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useLocale()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={t('cp.previewImage')} onClick={onClose} className="lightbox">
      {/* 点击图片本体不关闭(只有遮罩 / Esc 关) */}
      <img src={src} alt={t('cp.previewImage')} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
