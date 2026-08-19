import { useStore } from '../store'
import { t, useLocale } from '../i18n'

interface Props {
  onDelete: (uuid: string) => void
}

/** 队列 dock(dsh 对齐):生成中可继续输入排队,排队项可见/可撤销 */
export default function QueueDock({ onDelete }: Props) {
  const queue = useStore((s) => s.queue)
  useLocale()
  if (queue.length === 0) return null

  return (
    <div className="animate-pop-in mx-auto mb-2 max-w-3xl px-6">
      <div className="overflow-hidden rounded-xl border border-accent/30 bg-accent/5">
        <p className="border-b border-accent/20 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-accent">
          {t('queue.queued')} · {queue.length}
        </p>
        {queue.map((q) => (
          <div key={q.uuid} className="group flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-text-dim" title={q.text}>
              {q.text}
            </span>
            <button
              onClick={() => onDelete(q.uuid)}
              aria-label={t('queue.delete')}
              className="shrink-0 text-[11px] text-text-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
