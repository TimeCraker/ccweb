import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'

export interface EndpointOpt {
  key: string
  name: string
  baseUrl: string | null
}

export interface SettingsSnap {
  model: string | null
  permissionMode: string | null
  effort: string | null
  endpointTemplate: string | null
  currentEndpoint: string | null
  endpoints: EndpointOpt[]
}

interface Props {
  open: boolean
  onClose: () => void
  send: (msg: Record<string, unknown>) => void
}

const MODELS = ['auto', 'opus', 'sonnet', 'haiku', 'inherit']
const EFFORTS = ['low', 'medium', 'high', 'max']
const PERMISSIONS = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

export default function SettingsModal({ open, onClose, send }: Props) {
  const snap = useStore((s) => s.settings)
  const mcp = useStore((s) => s.mcpServers)
  useLocale()
  const [modelInput, setModelInput] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) send({ t: 'settings.get' })
  }, [open, send])

  // 焦点陷阱:打开聚焦首控件;Tab 在弹窗内循环;Esc 关闭(WAI-ARIA dialog 模式)
  useEffect(() => {
    if (!open) return
    const box = boxRef.current
    if (!box) return
    const first = box.querySelector<HTMLElement>('input, button, select')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = box.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const list = Array.from(focusables)
      const idx = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && (idx <= 0)) {
        e.preventDefault()
        list[list.length - 1]?.focus()
      } else if (!e.shiftKey && idx === list.length - 1) {
        e.preventDefault()
        list[0]?.focus()
      }
    }
    box.addEventListener('keydown', onKey)
    return () => box.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const patch = (p: Record<string, unknown>) => send({ t: 'settings.patch', patch: p })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="settings"
        tabIndex={-1}
        className="w-[520px] max-w-[92vw] rounded-xl border border-border-strong bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">{t('settings.title')}</h2>

        <Section label={t('settings.model')}>
          <div className="flex gap-2">
            <input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder={snap?.model ?? 'auto'}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => patch({ model: modelInput.trim() || null })}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              OK
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MODELS.map((m) => (
              <button
                key={m}
                onClick={() => patch({ model: m })}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                  snap?.model === m ? 'border-accent text-accent' : 'border-border text-text-faint hover:text-text-dim'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Section>

        <Section label={t('settings.effort')} hint={t('settings.effortHint')}>
          <div className="flex gap-1.5">
            {EFFORTS.map((e) => (
              <button
                key={e}
                onClick={() => patch({ effort: e })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  snap?.effort === e ? 'border-accent text-accent' : 'border-border text-text-faint hover:text-text-dim'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </Section>

        <Section label={t('settings.permission')}>
          <div className="flex flex-wrap gap-1.5">
            {PERMISSIONS.map((p) => (
              <button
                key={p}
                onClick={() => patch({ permissionMode: p })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  snap?.permissionMode === p
                    ? 'border-accent text-accent'
                    : 'border-border text-text-faint hover:text-text-dim'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Section>

        <Section label={t('settings.endpoint')} hint={t('settings.endpointHint')}>
          <p className="mb-2 truncate font-mono text-[11px] text-text-faint">
            {t('settings.current')}: {snap?.currentEndpoint ?? '—'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(snap?.endpoints ?? []).map((e) => (
              <button
                key={e.key}
                title={e.baseUrl ?? ''}
                onClick={() => patch({ endpointTemplate: e.key })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  snap?.endpointTemplate === e.key
                    ? 'border-accent text-accent'
                    : 'border-border text-text-faint hover:text-text-dim'
                }`}
              >
                {e.name}
              </button>
            ))}
          </div>
        </Section>

        <Section label={t('settings.mcp')}>
          <button
            onClick={() => send({ t: 'mcp.status' })}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-dim hover:border-accent hover:text-accent"
          >
            {t('settings.queryMcp')}
          </button>
          {mcp.length > 0 && (
            <ul className="mt-2 space-y-1">
              {mcp.map((s) => (
                <li key={s.name} className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-text-dim">{s.name}</span>
                  <span className={s.status === 'connected' ? 'text-ok' : 'text-warn'}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}
          {mcp.length === 0 && (
            <p className="mt-2 text-[11px] text-text-faint">{t('settings.mcpEmpty')}</p>
          )}
        </Section>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border-strong px-4 py-1.5 text-xs font-medium text-text-dim hover:text-text"
          >
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-faint">{label}</h3>
        {hint && <span className="text-[10px] text-text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}
