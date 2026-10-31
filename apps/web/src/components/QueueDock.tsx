import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconX } from './Icon'

interface Props {
  onDelete: (uuid: string) => void
  onResume?: () => void
}

/** 队列 dock:生成中可继续输入排队,排队项可见/可撤销 */
export default function QueueDock({ onDelete, onResume }: Props) {
  const busy = useStore((s) => s.busy)
  const queue = useStore((s) => s.queue)
  useLocale()
  if (queue.length === 0) return null

  return (
    <div className="queue-dock">
      <div className="queue-item" style={{ background: 'var(--color-panel-2)' }}>
        <span className="badge accent">{t('queue.queued')}</span>
        <span style={{ flex: 1, fontSize: 11.5, color: 'var(--color-text-faint)' }}>
          {queue.length} 条消息等待发送
        </span>
        {!busy && onResume && (
          <button className="btn btn-sm" onClick={onResume}>
            继续队列
          </button>
        )}
      </div>
      {queue.map((item) => (
        <div key={item.uuid} className="queue-item">
          <span className="text" title={item.text}>
            {item.text}
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => onDelete(item.uuid)} aria-label={t('queue.delete')}>
            <IconX width={11} height={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
