import { useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { IconChevron, IconPlus, IconImage } from './Icon'
import { Menu, MenuItem } from './ui/Menu'

type Send = (message: Record<string, unknown>) => void
type Scope = 'session' | 'default' | 'both'

const MODE_META = [
  { value: 'default', label: 'mode.default', desc: 'mode.default.desc' },
  { value: 'plan', label: 'mode.plan', desc: 'mode.plan.desc' },
  { value: 'auto', label: 'mode.auto', desc: 'mode.auto.desc' },
  { value: 'acceptEdits', label: 'mode.acceptEdits', desc: 'mode.acceptEdits.desc' },
  { value: 'bypassPermissions', label: 'mode.bypass', desc: 'mode.bypass.desc' },
] as const

const ADVANCED = new Set(['acceptEdits', 'bypassPermissions'])
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const EFFORT_LABEL: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最大',
}

export function modeLabel(value: string | null | undefined): string {
  const found = MODE_META.find((item) => item.value === value)
  return found ? t(found.label) : t('mode.default')
}

/** 当前连接名:优先端点模板名,其次主机名;没有配置时返回 null */
export function useConnectionLabel(): { name: string | null; endpoint: string | null } {
  const settings = useStore((s) => s.settings)
  const activeEndpoint = useStore((s) => s.endpoint)
  const template = settings?.active ? settings.active.endpointTemplate : settings?.endpointTemplate
  const matched = template ? settings?.endpoints.find((item) => item.key === template) : undefined
  const endpoint = activeEndpoint ?? (settings?.active ? null : (settings?.currentEndpoint ?? settings?.endpoints[0]?.baseUrl ?? null))
  let name = matched?.name ?? null
  if (!name && endpoint) {
    try {
      name = new URL(endpoint).host
    } catch {
      name = endpoint
    }
  }
  return { name, endpoint }
}

export function currentModelOf(
  settings: ReturnType<typeof useStore.getState>['settings'],
  live: string | null,
  liveProvider?: string | null,
): string | null {
  if (settings?.active) {
    return settings.active.providerModel ?? settings.active.model ?? liveProvider ?? live ?? settings.currentModel ?? null
  }
  return settings?.providerModel ?? settings?.model ?? liveProvider ?? live ?? settings?.currentModel ?? null
}

/** 设置变更统一入口:scope 决定只影响当前会话、只保存默认,还是两者 */
function useSettingsPatch(send: Send) {
  const sessionId = useStore((s) => s.sessionId)
  const pending = useStore((s) => s.settingsPending !== null)
  const patch = (value: Record<string, unknown>, scope: Scope) => send({ t: 'settings.patch', patch: value, scope })
  const sessionScope: Scope = sessionId ? 'session' : 'default'
  return { sessionId, pending, patch, sessionScope }
}

function PendingHint({ pending }: { pending: boolean }) {
  if (!pending) return null
  return (
    <p className="menu-foot-note" role="status">
      正在等待运行时确认…
    </p>
  )
}

/** 工作方式菜单:默认只作用于当前会话,另设“保存为默认” */
export function ModeMenu({ send, disabled }: { send: Send; disabled?: boolean }) {
  const settings = useStore((s) => s.settings)
  const busy = useStore((s) => s.busy)
  const { sessionId, pending, patch, sessionScope } = useSettingsPatch(send)
  const effective = settings?.active?.permissionMode ?? settings?.permissionMode ?? 'default'
  const defaultMode = settings?.permissionMode ?? 'default'
  return (
    <Menu
      label={t('cp.mode')}
      width={308}
      trigger={({ open }) => (
        <button
          className="chip-btn"
          aria-expanded={open}
          aria-busy={pending}
          aria-label={t('cp.mode')}
          title={`${t('cp.mode')}${pending ? ' · 确认中' : ''}`}
          disabled={disabled}
          style={pending ? { opacity: 0.7 } : undefined}
        >
          <span className="chip-label">{modeLabel(effective)}</span>{pending && <span className="dot live accent" aria-hidden="true" />}
          <IconChevron width={12} height={12} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">{sessionId ? '当前会话的工作方式' : '新会话默认工作方式'}</div>
          {MODE_META.filter((item) => !ADVANCED.has(item.value)).map((item) => (
            <MenuItem
              key={item.value}
              selected={effective === item.value}
              description={t(item.desc)}
              onClick={() => {
                close()
                patch({ permissionMode: item.value }, sessionScope)
              }}
            >
              {t(item.label)}
            </MenuItem>
          ))}
          <div className="menu-sep" />
          <div className="menu-label">{t('mode.advanced')}</div>
          {MODE_META.filter((item) => ADVANCED.has(item.value)).map((item) => (
            <MenuItem
              key={item.value}
              selected={effective === item.value}
              description={t(item.desc)}
              onClick={() => {
                if (item.value === 'bypassPermissions' && !window.confirm(t('mode.confirmBypass'))) return
                close()
                patch({ permissionMode: item.value }, sessionScope)
              }}
            >
              {t(item.label)}
            </MenuItem>
          ))}
          <div className="menu-sep" />
          <MenuItem
            disabled={defaultMode === effective}
            onClick={() => {
              close()
              patch({ permissionMode: effective }, 'default')
            }}
            description={
              defaultMode === effective
                ? '当前选择已经是新会话的默认值'
                : `新会话默认：${modeLabel(defaultMode)}`
            }
          >
            保存为默认工作方式
          </MenuItem>
          <p className="menu-foot-note">
            {sessionId ? '修改只影响当前对话；默认值单独保存。' : '当前还没有会话，修改会保存为新会话默认。'}
          </p>
          {busy && <p className="menu-foot-note">生成中修改由运行时确认；不支持时保持原值。</p>}
          <PendingHint pending={pending} />
        </>
      )}
    </Menu>
  )
}

/** 模型菜单:模型/思考力度分层,连接切换需新会话生效 */
export function ModelMenu({
  send,
  onAddConnection,
  onNewSession,
}: {
  send: Send
  onAddConnection: () => void
  onNewSession?: () => void
}) {
  const settings = useStore((s) => s.settings)
  const liveModel = useStore((s) => s.model)
  const liveProvider = useStore((s) => s.providerModel)
  const availableModels = useStore((s) => s.availableModels)
  const conn = useStore((s) => s.conn)
  const busy = useStore((s) => s.busy)
  const { name: connectionName } = useConnectionLabel()
  const templates = settings?.endpointTemplate ?? null
  const activeTemplate = settings?.active ? settings.active.endpointTemplate : templates
  const activeConnection = activeTemplate
    ? settings?.endpoints.find((endpoint) => endpoint.key === activeTemplate)
    : undefined
  const model = currentModelOf(settings, liveModel, liveProvider)
  const defaultModel = settings?.model ?? null
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const { sessionId, pending, patch, sessionScope } = useSettingsPatch(send)
  const endpoints = settings?.endpoints ?? []
  const currentEffort = settings?.active?.effort ?? settings?.effort ?? null
  const defaultEffort = settings?.effort ?? null
  const sessionOverride = sessionId ? settings?.active?.model ?? null : null
  const currentSelection = sessionId ? sessionOverride : settings?.model ?? null
  const saveTarget = sessionId ? sessionOverride : settings?.model ?? null
  const runtimeModel = sessionId
    ? settings?.active?.model ?? liveModel ?? activeConnection?.model ?? null
    : settings?.model ?? liveModel ?? activeConnection?.model ?? null
  const currentModelInfo = availableModels.find(
    (item) =>
      item.value === runtimeModel ||
      item.resolvedModel === runtimeModel ||
      item.value === model ||
      item.resolvedModel === model,
  )
  const effortLevels: ReadonlyArray<(typeof EFFORTS)[number]> =
    !currentModelInfo || currentModelInfo.supportsEffort === false
      ? []
      : currentModelInfo.supportedEffortLevels?.length
        ? EFFORTS.filter((level) => currentModelInfo.supportedEffortLevels?.includes(level))
        : currentModelInfo.supportsEffort
          ? EFFORTS
          : []
  const models = [
    ...(sessionOverride && !availableModels.some((item) => item.value === sessionOverride)
      ? [{
          value: sessionOverride,
          displayName: sessionOverride,
          description: '当前会话覆盖',
          providerModel: settings?.active?.providerModel ?? null,
        }]
      : []),
    ...(settings?.model
      ? [{
          value: settings.model,
          displayName: settings.model,
          description: '新会话默认',
          providerModel: settings.providerModel ?? null,
        }]
      : []),
    ...availableModels,
  ].filter((item, index, list) => list.findIndex((other) => other.value === item.value) === index)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleEndpoints = normalizedQuery
    ? endpoints.filter((endpoint) =>
        [endpoint.name, endpoint.baseUrl ?? '', endpoint.model ?? ''].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : endpoints
  const visibleModels = models.filter(
    (item) =>
      !normalizedQuery ||
      item.value.toLowerCase().includes(normalizedQuery) ||
      item.displayName.toLowerCase().includes(normalizedQuery),
  )
  const disabled = conn !== 'open' || !settings

  const triggerLabel = model
    ? `${connectionName ? `${connectionName} · ` : ''}${model}`
    : connectionName
      ? `${connectionName} · 默认模型`
      : '选择模型'

  return (
    <Menu
      label={t('cp.model')}
      width={340}
      align="end"
      trigger={({ open }) => (
        <button
          className={`chip-btn model-chip ${model ? '' : 'warn'}`}
          aria-expanded={open}
          aria-busy={pending}
          aria-label={t('cp.model')}
          title={`${model ?? (connectionName ? '使用连接默认模型' : t('cp.needConnection'))}${pending ? ' · 确认中' : ''}`}
          disabled={disabled && !open}
          style={pending ? { opacity: 0.7 } : undefined}
        >
          <span className="chip-label">{triggerLabel}</span>{pending && <span className="dot live accent" aria-hidden="true" />}
          <IconChevron width={12} height={12} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模型或连接…"
              aria-label={t('cp.model')}
            />
          </div>

          {(normalizedQuery === '' || visibleEndpoints.length > 0) && (
            <>
              <div className="menu-label">
                已配置连接
                {sessionId && activeTemplate === null ? '（当前继承本机配置）' : ''}
              </div>
              {endpoints.length === 0 && normalizedQuery === '' && <p className="menu-empty">尚无已配置连接</p>}
              {visibleEndpoints.map((endpoint) => (
                <MenuItem
                  key={endpoint.key}
                  selected={templates === endpoint.key}
                  aside={activeTemplate === endpoint.key ? '当前' : templates === endpoint.key ? '新默认' : undefined}
                  description={`${endpoint.baseUrl ?? '地址未记录'}${endpoint.model ? ` · 默认 ${endpoint.model}` : ''}`}
                  onClick={() => {
                    close()
                    patch({ endpointTemplate: endpoint.key, model: null }, 'default')
                    if (sessionId && onNewSession) {
                      const apply = window.confirm('连接切换需要新会话才会生效。现在新建会话并应用？当前会话会保留在列表里。')
                      if (apply) setTimeout(() => onNewSession(), 0)
                    }
                  }}
                >
                  {endpoint.name}
                </MenuItem>
              ))}
              {normalizedQuery === '' && (
                <MenuItem
                  icon={<IconPlus width={14} height={14} style={{ marginTop: 2, color: 'var(--color-accent)' }} />}
                  onClick={() => {
                    close()
                    onAddConnection()
                  }}
                  description="填写接口地址与 API Key"
                >
                  添加模型连接
                </MenuItem>
              )}
              <div className="menu-sep" />
            </>
          )}

          <div className="menu-label">{sessionId ? '当前会话的模型' : '新会话默认模型'}</div>
          <MenuItem
            selected={currentSelection === null}
            description={
              activeConnection?.model ? `由连接决定：${activeConnection.model}` : '由连接决定，切换连接时恢复'
            }
            onClick={() => {
              close()
              patch({ model: null }, sessionScope)
            }}
          >
            使用连接默认
          </MenuItem>
          {visibleModels.length === 0 && (
            <p className="menu-empty">
              {normalizedQuery
                ? visibleEndpoints.length > 0
                  ? '没有匹配的模型，上方连接仍可选'
                  : '没有匹配的模型或连接'
                : '使用连接默认模型即可；运行一次任务后也会自动发现可用模型。'}
            </p>
          )}
          {visibleModels.map((item) => (
            <MenuItem
              key={item.value}
              selected={currentSelection === item.value}
              description={
                item.providerModel && item.providerModel !== item.value
                  ? `运行时 ID：${item.value}${item.description ? ` · ${item.description}` : ''}`
                  : item.description || item.displayName
              }
              onClick={() => {
                close()
                patch({ model: item.value }, sessionScope)
              }}
            >
              {item.providerModel ?? item.value}
            </MenuItem>
          ))}
          {availableModels.length > 0 && (
            <p className="menu-foot-note">
              这里只显示运行时发现的模型清单；是否可用仍取决于服务商账号权限与额度。
            </p>
          )}

          <div className="menu-sep" />
          <MenuItem
            disabled={defaultModel === saveTarget}
            description={`新会话使用：${saveTarget ?? '连接默认模型'}`}
            onClick={() => {
              close()
              patch({ model: saveTarget }, 'default')
            }}
          >
            保存为默认模型
          </MenuItem>

          <div className="menu-sep" />
          <div className="menu-label">
            思考力度
            <span style={{ marginLeft: 6, fontWeight: 400 }}>新会话生效</span>
          </div>
          <div className="effort-row">
            <button
              className={`effort-pill ${currentEffort == null ? 'is-active' : ''}`}
              onClick={() => patch({ effort: null }, 'default')}
              title="使用运行时默认"
            >
              默认
            </button>
            {effortLevels.map((effort) => (
              <button
                key={effort}
                className={`effort-pill ${currentEffort === effort ? 'is-active' : ''}`}
                onClick={() => patch({ effort }, 'default')}
                title={`新会话使用 ${effort}`}
              >
                {EFFORT_LABEL[effort]}
              </button>
            ))}
          </div>
          <p className="menu-foot-note">
            {effortLevels.length === 0
              ? currentModelInfo?.supportsEffort === false
                ? '当前模型声明不支持思考档位，保持「默认」。'
                : '运行时没有报告当前模型的思考档位，保持「默认」；发现模型可用后再查看支持范围。'
              : currentEffort && !effortLevels.includes(currentEffort as (typeof EFFORTS)[number])
                ? `当前设置「${EFFORT_LABEL[currentEffort] ?? currentEffort}」不在该模型声明的支持范围内，运行时可能拒绝；选择下方档位会覆盖。`
                : currentEffort === defaultEffort
                  ? '思考力度只影响新会话；模型/服务商不支持时会被拒绝，运行时确认后保持原值。'
                  : `当前会话尚未切换；新会话将使用「${currentEffort ? EFFORT_LABEL[currentEffort] ?? currentEffort : '默认'}」。`}
          </p>

          <div className="menu-sep" />
          <form
            className="custom-model"
            onSubmit={(e) => {
              e.preventDefault()
              if (!custom.trim()) return
              close()
              patch({ model: custom.trim() }, sessionScope)
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="自定义模型 ID"
              aria-label="自定义模型 ID"
            />
            <button type="submit" className="btn btn-sm" disabled={!custom.trim()}>
              应用
            </button>
          </form>
          {busy && <p className="menu-foot-note">生成中修改由运行时确认；不支持时保持原值。</p>}
          <PendingHint pending={pending} />
        </>
      )}
    </Menu>
  )
}

/** 输入区左侧「＋」:添加图片 / 引用项目文件 */
export function AttachMenu({ onPickImage, onReferenceFile }: { onPickImage: () => void; onReferenceFile: () => void }) {
  return (
    <Menu
      label={t('cp.attach')}
      width={286}
      trigger={({ open }) => (
        <button className="add-btn" aria-expanded={open} aria-label={t('cp.attach')} title={t('cp.attach')}>
          <IconPlus width={17} height={17} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<IconImage width={15} height={15} style={{ marginTop: 2 }} />}
            description={t('cp.attachImageHint')}
            onClick={() => {
              close()
              onPickImage()
            }}
          >
            {t('cp.attachImage')}
          </MenuItem>
          <MenuItem
            icon={
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }} aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
              </svg>
            }
            description={t('cp.attachFileHint')}
            onClick={() => {
              close()
              onReferenceFile()
            }}
          >
            {t('cp.attachFile')}
          </MenuItem>
          <div className="menu-sep" />
          <p className="menu-foot-note" style={{ padding: '4px 10px 6px' }}>
            也可以直接拖入或粘贴图片。附件只支持 PNG/JPEG/GIF/WebP，每张不超过 5 MB；模型是否理解图片取决于所选服务商。
          </p>
        </>
      )}
    </Menu>
  )
}
