import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, tf, useLocale, type DictKey } from '../i18n'

export interface EndpointOpt {
  key: string
  name: string
  baseUrl: string | null
}

export type SettingsSnap = import('../types').SettingsSnapshot
export interface EndpointOpt {
  key: string
  name: string
  baseUrl: string | null
}

type Tab = 'model' | 'endpoint' | 'permission' | 'skills' | 'rules' | 'mcp'

const TABS = [
  { id: 'model', label: 'st.tab.model' },
  { id: 'endpoint', label: 'st.tab.endpoint' },
  { id: 'permission', label: 'st.tab.permission' },
  { id: 'skills', label: 'st.tab.skills' },
  { id: 'rules', label: 'st.tab.rules' },
  { id: 'mcp', label: 'st.tab.mcp' },
] as const satisfies Array<{ id: Tab; label: DictKey }>

const EFFORTS = ['low', 'medium', 'high', 'max']
const PERMISSIONS = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const SCOPES = ['full', 'project', 'none'] as const
const SCOPE_LABELS: Record<(typeof SCOPES)[number], DictKey> = {
  full: 'st.model.scope.full',
  project: 'st.model.scope.project',
  none: 'st.model.scope.none',
}

interface Props {
  open: boolean
  onClose: () => void
  send: (msg: Record<string, unknown>) => void
}

export default function SettingsModal({ open, onClose, send }: Props) {
  const snap = useStore((s) => s.settings)
  const mcp = useStore((s) => s.mcpServers)
  useLocale()
  const [tab, setTab] = useState<Tab>('model')
  const [modelInput, setModelInput] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) send({ t: 'settings.get' })
  }, [open, send])

  // 焦点陷阱:打开聚焦首控件;Tab 循环不出弹窗;Esc 关闭(WAI-ARIA dialog)
  useEffect(() => {
    if (!open) return
    const box = boxRef.current
    if (!box) return
    box.querySelector<HTMLElement>('button, input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = box.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const list = Array.from(focusables)
      const idx = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && idx <= 0) {
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
    <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="settings"
        tabIndex={-1}
        className="animate-pop-in flex h-[560px] max-h-[90vh] w-[720px] max-w-[94vw] overflow-hidden rounded-xl border border-border-strong bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧 tab 导航(ARIA tabs) */}
        <nav className="w-40 shrink-0 border-r border-border bg-panel-2/40 p-2" role="tablist" aria-label="settings sections">
          <p className="px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">
            {t('st.title')}
          </p>
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`mb-0.5 w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                tab === x.id ? 'bg-panel-2 font-medium text-accent' : 'text-text-dim hover:text-text'
              }`}
            >
              {t(x.label)}
            </button>
          ))}
        </nav>

        {/* 右侧内容 */}
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {tab === 'model' && <ModelTab snap={snap} modelInput={modelInput} setModelInput={setModelInput} patch={patch} />}
          {tab === 'endpoint' && <EndpointTab snap={snap} patch={patch} />}
          {tab === 'permission' && (
            <div>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
                {t('st.tab.permission')}
              </h3>
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
              <p className="mt-3 text-[11px] leading-relaxed text-text-faint">{t('st.pm.note1')}</p>
            </div>
          )}
          {tab === 'skills' && <SkillsTab snap={snap} />}
          {tab === 'rules' && <RulesTab snap={snap} />}
          {tab === 'mcp' && <McpTab mcp={mcp} send={send} />}
        </div>

        <button
          onClick={onClose}
          className="absolute right-4 top-3.5 icon-btn"
          aria-label="close settings"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function ModelTab({
  snap,
  modelInput,
  setModelInput,
  patch,
}: {
  snap: SettingsSnap | null
  modelInput: string
  setModelInput: (v: string) => void
  patch: (p: Record<string, unknown>) => void
}) {
  useLocale()
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">{t('st.tab.model')}</h3>
      <p className="mb-3 rounded-lg border border-border bg-panel-2/40 px-3 py-2 text-xs text-text-dim">
        {t('st.model.active')}
        <span className="ml-1 font-mono text-accent">{snap?.currentModel ?? t('st.model.default')}</span>
      </p>
      <div className="flex gap-2">
        <input
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder={t('st.model.placeholder')}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          onClick={() => patch({ model: modelInput.trim() || null })}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          {t('st.model.apply')}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-text-faint">{t('st.model.note')}</p>

      <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {t('st.model.effort')} <span className="normal-case text-text-faint">({t('st.model.effortNote')})</span>
      </h3>
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

      <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {t('st.model.scope')} <span className="normal-case text-text-faint">({t('st.model.scopeNote')})</span>
      </h3>
      <div className="flex gap-1.5">
        {SCOPES.map((sc) => {
          // 三个候选均为纯文本词条;联合 key 使 Value<K> 含函数签名,断言收敛
          const label = t(SCOPE_LABELS[sc]) as string
          return (
            <button
              key={sc}
              onClick={() => patch({ contextScope: sc })}
              title={label}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                (snap?.contextScope ?? 'full') === sc
                  ? 'border-accent text-accent'
                  : 'border-border text-text-faint hover:text-text-dim'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-text-faint">{t('st.model.scopeHelp')}</p>
    </div>
  )
}

function EndpointTab({
  snap,
  patch,
}: {
  snap: SettingsSnap | null
  patch: (p: Record<string, unknown>) => void
}) {
  useLocale()
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">{t('st.tab.endpoint')}</h3>
      <p className="mb-1 text-[11px] text-text-faint">{t('st.ep.active')}</p>
      <p className="mb-4 break-all rounded-lg border border-border bg-panel-2/40 px-3 py-2 font-mono text-xs text-accent">
        {snap?.currentEndpoint ?? '—'}
      </p>

      <p className="mb-2 text-[11px] text-text-faint">{t('st.ep.switch')}</p>
      <div className="space-y-1">
        {(snap?.endpoints ?? []).map((e) => (
          <button
            key={e.key}
            onClick={() => patch({ endpointTemplate: e.key })}
            className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors ${
              snap?.endpointTemplate === e.key
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-border-strong'
            }`}
          >
            <span className={`text-xs font-medium ${snap?.endpointTemplate === e.key ? 'text-accent' : 'text-text-dim'}`}>
              {e.name}
            </span>
            <span className="break-all font-mono text-[10px] text-text-faint">{e.baseUrl ?? t('st.ep.noUrl')}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-faint">{t('st.ep.note')}</p>
    </div>
  )
}

function SkillsTab({ snap }: { snap: SettingsSnap | null }) {
  useLocale()
  const skills = snap?.skills ?? []
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {tf('st.skills.count', skills.length)}
      </h3>
      <div className="space-y-1">
        {skills.map((s) => (
          <div key={s.name} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-text-dim">{s.name}</span>
              <span className="ml-auto rounded bg-ok/10 px-1.5 py-0.5 text-[10px] text-ok">{t('st.skills.enabled')}</span>
            </div>
            {s.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-faint">{s.description}</p>
            )}
          </div>
        ))}
        {skills.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">{t('st.skills.none')}</p>
        )}
      </div>
    </div>
  )
}

function RulesTab({ snap }: { snap: SettingsSnap | null }) {
  const [openMd, setOpenMd] = useState(false)
  useLocale()
  const rules = snap?.rules ?? []
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        {t('st.rules.title')}
      </h3>
      <div className="space-y-1">
        {rules.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="font-mono text-xs text-text-dim">{r.name}</span>
            <span className="font-mono text-[10px] text-text-faint">{tf('st.rules.chars', r.size)}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpenMd((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:border-border-strong"
      >
        <span className="font-mono text-xs text-text-dim">{t('st.rules.claudeMd')}</span>
        <span className={`text-text-faint transition-transform ${openMd ? 'rotate-90' : ''}`}>▸</span>
      </button>
      {openMd && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-text-dim">
          {snap?.claudeMd ?? t('st.rules.noMd')}
        </pre>
      )}
    </div>
  )
}

function McpTab({ mcp, send }: { mcp: Array<{ name: string; status: string }>; send: (m: Record<string, unknown>) => void }) {
  useLocale()
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">{t('st.tab.mcp')}</h3>
      <button
        onClick={() => send({ t: 'mcp.status' })}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-dim hover:border-accent hover:text-accent"
      >
        {t('st.mcp.refresh')}
      </button>
      {mcp.length > 0 && (
        <ul className="mt-3 space-y-1">
          {mcp.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 font-mono text-xs">
              <span className="text-text-dim">{s.name}</span>
              <span className={s.status === 'connected' ? 'text-ok' : 'text-warn'}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}
      {mcp.length === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-text-faint">{t('st.mcp.none')}</p>
      )}
    </div>
  )
}
