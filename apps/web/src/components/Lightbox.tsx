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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('cp.previewImage')}
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-10"
    >
      {/* 点击图片本体不关闭(只有遮罩/ Esc 关) */}
      <img
        src={src}
        alt={t('cp.previewImage')}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  )
}
