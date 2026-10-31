import { useState } from 'react'
import { t, tf, useLocale } from '../i18n'
import type { ThinkingBlock as T } from '../render/blocks'
import { IconBrain } from './Icon'

export default function ThinkingBlock({ block }: { block: T }) {
  const [open, setOpen] = useState(false)
  useLocale()
  const lines = block.text.split('\n').length

  return (
    <div className="thinking">
      <details open={open}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            setOpen((value) => !value)
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconBrain
              width={12}
              height={12}
              style={block.streaming ? { color: 'var(--color-accent)' } : undefined}
            />
            {block.streaming ? t('th.thinking') : tf('th.thought', lines)}
            <span style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 140ms' }}>▸</span>
          </span>
        </summary>
        {open && <div className="thinking-body">{block.text}</div>}
      </details>
    </div>
  )
}
