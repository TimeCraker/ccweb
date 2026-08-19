import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useLocale } from '../i18n'

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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'model', label: '模型' },
  { id: 'endpoint', label: '端点' },
  { id: 'permission', label: '权限' },
  { id: 'skills', label: 'Skills' },
  { id: 'rules', label: '规则' },
  { id: 'mcp', label: 'MCP' },
]

const EFFORTS = ['low', 'medium', 'high', 'max']
const PERMISSIONS = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

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

  // 焦点陷阱 + Esc(WAI-ARIA dialog)
  useEffect(() => {
    if (!open) return
    const box = boxRef.current
    if (!box) return
    box.querySelector<HTMLElement>('button, input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
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
        {/* 左侧 tab 导航 */}
        <nav className="w-40 shrink-0 border-r border-border bg-panel-2/40 p-2">
          <p className="px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">
            设置
          </p>
          {TABS.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`mb-0.5 w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                tab === x.id ? 'bg-panel-2 font-medium text-accent' : 'text-text-dim hover:text-text'
              }`}
            >
              {x.label}
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
                权限模式
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
              <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
                default 按需询问(推荐)· acceptEdits 自动接受编辑 · plan 只读规划 · bypassPermissions
                全放行(危险)
              </p>
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
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">模型</h3>
      <p className="mb-3 rounded-lg border border-border bg-panel-2/40 px-3 py-2 text-xs text-text-dim">
        当前生效(settings.json):
        <span className="ml-1 font-mono text-accent">{snap?.currentModel ?? '默认'}</span>
      </p>
      <div className="flex gap-2">
        <input
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder="自定义模型 ID,如 glm-4.7"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          onClick={() => patch({ model: modelInput.trim() || null })}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          应用
        </button>
      </div>
      <p className="mt-2 text-[11px] text-text-faint">留空则用端点默认模型;别名(opus/sonnet/haiku)由端点映射。</p>

      <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        思考力度 <span className="normal-case text-text-faint">(新会话生效)</span>
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
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">API 端点</h3>
      <p className="mb-1 text-[11px] text-text-faint">当前生效(读 ~/.claude/settings.json 真值):</p>
      <p className="mb-4 break-all rounded-lg border border-border bg-panel-2/40 px-3 py-2 font-mono text-xs text-accent">
        {snap?.currentEndpoint ?? '—'}
      </p>

      <p className="mb-2 text-[11px] text-text-faint">
        切换模板(来自 cc-toolkit,新会话生效;URL 明文可见):
      </p>
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
            <span className="break-all font-mono text-[10px] text-text-faint">{e.baseUrl ?? '(无 URL)'}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
        模板内容与实际不符?那是 cc-toolkit/settings/settings.&lt;name&gt;.json 的配置——在设置里改它不如直接改模板文件。
      </p>
    </div>
  )
}

function SkillsTab({ snap }: { snap: SettingsSnap | null }) {
  const skills = snap?.skills ?? []
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        用户 Skills({skills.length})· 全部自动生效
      </h3>
      <div className="space-y-1">
        {skills.map((s) => (
          <div key={s.name} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-text-dim">{s.name}</span>
              <span className="ml-auto rounded bg-ok/10 px-1.5 py-0.5 text-[10px] text-ok">启用</span>
            </div>
            {s.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-faint">{s.description}</p>
            )}
          </div>
        ))}
        {skills.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">~/.claude/skills 下暂无技能</p>
        )}
      </div>
    </div>
  )
}

function RulesTab({ snap }: { snap: SettingsSnap | null }) {
  const [openMd, setOpenMd] = useState(false)
  const rules = snap?.rules ?? []
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">
        全局规则(每会话全量加载)
      </h3>
      <div className="space-y-1">
        {rules.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="font-mono text-xs text-text-dim">{r.name}</span>
            <span className="font-mono text-[10px] text-text-faint">{(r.size / 1000).toFixed(1)}k 字符</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpenMd((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:border-border-strong"
      >
        <span className="font-mono text-xs text-text-dim">CLAUDE.md(全局指令)</span>
        <span className={`text-text-faint transition-transform ${openMd ? 'rotate-90' : ''}`}>▸</span>
      </button>
      {openMd && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-text-dim">
          {snap?.claudeMd ?? '(未找到 ~/.claude/CLAUDE.md)'}
        </pre>
      )}
    </div>
  )
}

function McpTab({ mcp, send }: { mcp: Array<{ name: string; status: string }>; send: (m: Record<string, unknown>) => void }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-faint">MCP 服务</h3>
      <button
        onClick={() => send({ t: 'mcp.status' })}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-dim hover:border-accent hover:text-accent"
      >
        刷新状态
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
        <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
          发送一条消息后可查询;MCP 服务配置在 ~/.claude/settings.json 的 mcpServers 段。
        </p>
      )}
    </div>
  )
}
