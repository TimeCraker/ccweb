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

const EFFORT_CACHE_KEY = 'ccweb.lastEffort'
const MODEL_EFFORT_CACHE_KEY = 'ccweb.modelEffortCache'

export function getCachedEffort(modelName?: string | null): (typeof EFFORTS)[number] | null {
  try {
    if (modelName) {
      const raw = localStorage.getItem(MODEL_EFFORT_CACHE_KEY)
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string>
        const val = map[modelName]
        if (val && (EFFORTS as readonly string[]).includes(val)) return val as (typeof EFFORTS)[number]
      }
    }
    const globalLast = localStorage.getItem(EFFORT_CACHE_KEY)
    if (globalLast && (EFFORTS as readonly string[]).includes(globalLast)) {
      return globalLast as (typeof EFFORTS)[number]
    }
  } catch {
    /* ignore localStorage errors */
  }
  return null
}

export function saveCachedEffort(effort: string | null, modelName?: string | null) {
  try {
    if (effort && (EFFORTS as readonly string[]).includes(effort)) {
      localStorage.setItem(EFFORT_CACHE_KEY, effort)
      if (modelName) {
        const raw = localStorage.getItem(MODEL_EFFORT_CACHE_KEY)
        const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
        map[modelName] = effort
        localStorage.setItem(MODEL_EFFORT_CACHE_KEY, JSON.stringify(map))
      }
    } else {
      if (modelName) {
        const raw = localStorage.getItem(MODEL_EFFORT_CACHE_KEY)
        if (raw) {
          const map = JSON.parse(raw) as Record<string, string>
          delete map[modelName]
          localStorage.setItem(MODEL_EFFORT_CACHE_KEY, JSON.stringify(map))
        }
      }
    }
  } catch {
    /* ignore localStorage errors */
  }
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

/** 模型菜单:多级视图架构(对标 DeepSeek Harness)，清晰分离模型与推理等级 */
export function ModelMenu({
  send,
  onAddConnection,
  _onNewSession,
}: {
  send: Send
  onAddConnection: () => void
  _onNewSession?: () => void
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
  const [view, setView] = useState<'root' | 'models' | 'effort'>('root')
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
    currentModelInfo?.supportsEffort === false
      ? []
      : currentModelInfo?.supportedEffortLevels?.length
        ? EFFORTS.filter((level) => currentModelInfo.supportedEffortLevels?.includes(level))
        : EFFORTS
  const cachedEffort = getCachedEffort(runtimeModel)
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
  const disabled = conn !== 'open' || !settings

  // 解析模型名与可选 badge (例如 "glm-5.3[1m]" -> name="glm-5.3", badge="1m")
  const rawModelName = model ?? (connectionName ? '使用连接默认模型' : '选择模型')
  const badgeMatch = /^(.*?)\s*\[(.*?)\]$/.exec(rawModelName)
  const displayModelName = badgeMatch ? badgeMatch[1] : rawModelName
  const displayBadge = badgeMatch ? badgeMatch[2] : null
  const displayEffort = currentModelInfo?.supportsEffort === false
    ? '无思考'
    : currentEffort
      ? (EFFORT_LABEL[currentEffort] ?? currentEffort)
      : '默认'

  const fullChipTitle = `${connectionName ? `${connectionName} · ` : ''}${displayModelName}`

  return (
    <Menu
      label={t('cp.model')}
      width={320}
      align="end"
      onOpen={() => {
        setView('root')
        setQuery('')
      }}
      trigger={({ open }) => (
        <button
          className={`chip-btn model-chip ${model ? '' : 'warn'}`}
          aria-expanded={open}
          aria-busy={pending}
          aria-label={t('cp.model')}
          title={`${rawModelName} · 推理等级: ${displayEffort}${pending ? ' · 确认中' : ''}`}
          disabled={disabled && !open}
          style={pending ? { opacity: 0.7 } : undefined}
        >
          <span className="chip-model-name">{fullChipTitle}</span>
          {displayBadge && <span className="chip-badge">{displayBadge}</span>}
          <span className="chip-effort">{displayEffort}</span>
          {pending && <span className="dot live accent" aria-hidden="true" />}
          <IconChevron width={12} height={12} />
        </button>
      )}
    >
      {(close) => (
        <>
          {view === 'root' && (
            <div className="model-menu-root">
              <div className="menu-label row">
                <span>当前模型</span>
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setView('models')}
                >
                  全部模型与连接 ›
                </button>
              </div>

              {currentSelection && !availableModels.some((item) => item.value === currentSelection) && (
                <MenuItem
                  selected={true}
                  description={sessionId && sessionOverride ? '当前会话覆盖' : '已选择模型'}
                  onClick={() => {
                    close()
                    patch({ model: currentSelection }, sessionScope)
                  }}
                >
                  {currentSelection}
                </MenuItem>
              )}

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

              {availableModels.map((item) => (
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

              <button
                type="button"
                className="model-nav-row"
                onClick={() => setView('models')}
                style={{ marginTop: 4 }}
              >
                <span className="model-nav-title">切换连接商 / 全部模型</span>
                <span className="model-nav-right">
                  <span className="model-nav-value" title={rawModelName}>
                    {displayModelName}
                  </span>
                  {displayBadge && <span className="model-badge">{displayBadge}</span>}
                  <IconChevron width={12} height={12} style={{ transform: 'rotate(-90deg)', color: 'var(--color-text-faint)' }} />
                </span>
              </button>

              <div className="menu-sep" />

              <div className="menu-label row">
                <span>推理等级</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>新会话生效</span>
              </div>

              <div className="effort-row">
                <button
                  className={`effort-pill ${currentEffort == null ? 'is-active' : ''}`}
                  onClick={() => {
                    patch({ effort: null }, 'default')
                    saveCachedEffort(null, runtimeModel)
                  }}
                  title="使用运行时默认"
                >
                  默认
                </button>
                {effortLevels.map((effort) => (
                  <button
                    key={effort}
                    className={`effort-pill ${currentEffort === effort ? 'is-active' : ''}`}
                    onClick={() => {
                      patch({ effort }, 'default')
                      saveCachedEffort(effort, runtimeModel)
                    }}
                    title={`新会话使用 ${effort} (${EFFORT_LABEL[effort]})`}
                  >
                    {EFFORT_LABEL[effort]}
                  </button>
                ))}
              </div>

              {currentEffort === null && cachedEffort && effortLevels.includes(cachedEffort) && (
                <div style={{ padding: '0 10px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>上次使用：</span>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ fontSize: 11, color: 'var(--color-accent)', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      patch({ effort: cachedEffort }, 'default')
                      saveCachedEffort(cachedEffort, runtimeModel)
                    }}
                  >
                    恢复「{EFFORT_LABEL[cachedEffort]}」档位
                  </button>
                </div>
              )}

              {effortLevels.length > 0 && (
                <button
                  type="button"
                  className="model-nav-row"
                  onClick={() => setView('effort')}
                  style={{ padding: '4px 10px 6px' }}
                >
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-dim)' }}>详细档位说明</span>
                  <span className="model-nav-right">
                    <span className="model-nav-value">{displayEffort}</span>
                    <IconChevron width={12} height={12} style={{ transform: 'rotate(-90deg)', color: 'var(--color-text-faint)' }} />
                  </span>
                </button>
              )}

              <div className="menu-sep" />

              <MenuItem
                disabled={defaultModel === saveTarget && defaultEffort === currentEffort}
                description={
                  saveTarget
                    ? `新会话使用：${saveTarget}${currentEffort ? ` · 思考：${EFFORT_LABEL[currentEffort] ?? currentEffort}` : ''}`
                    : currentEffort
                      ? `新会话思考：${EFFORT_LABEL[currentEffort] ?? currentEffort}`
                      : undefined
                }
                onClick={() => {
                  close()
                  patch({ model: saveTarget, effort: currentEffort }, 'default')
                  saveCachedEffort(currentEffort, saveTarget ?? runtimeModel)
                }}
              >
                保存为默认模型
              </MenuItem>

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
            </div>
          )}

          {view === 'models' && (
            <div className="model-select-view">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-back-btn"
                  onClick={() => setView('root')}
                  aria-label="返回"
                >
                  <IconChevron width={13} height={13} style={{ transform: 'rotate(90deg)' }} />
                  <span>返回</span>
                </button>
                <div className="menu-search" style={{ flex: 1, padding: 0 }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索模型或连接…"
                    aria-label={t('cp.model')}
                    autoFocus
                  />
                </div>
              </div>

              <div className="menu-label">已配置连接</div>

              {/* 分组列表：按已配置连接 endpoints 进行分组展现 */}
              {endpoints.map((endpoint) => {
                const isCurrentEndpoint = (activeTemplate === endpoint.key) || (!activeTemplate && endpoint.key === templates)
                const epNameLower = endpoint.name.toLowerCase()
                const matchesEndpointName = epNameLower.includes(normalizedQuery)
                
                // 该连接下的候选模型
                const candidateModels = isCurrentEndpoint
                  ? models
                  : (endpoint.model ? [{ value: endpoint.model, displayName: endpoint.model, providerModel: null, description: '连接默认模型' }] : [])

                const matchedModels = candidateModels.filter((m) =>
                  !normalizedQuery || matchesEndpointName || m.value.toLowerCase().includes(normalizedQuery) || m.displayName.toLowerCase().includes(normalizedQuery)
                )

                if (normalizedQuery && !matchesEndpointName && matchedModels.length === 0) {
                  return null
                }

                return (
                  <div key={endpoint.key} className="model-group" style={{ marginBottom: 6 }}>
                    <MenuItem
                      selected={templates === endpoint.key}
                      aside={isCurrentEndpoint ? '当前连接' : undefined}
                      description={endpoint.model ? `默认模型: ${endpoint.model}` : undefined}
                      onClick={() => {
                        close()
                        if (!isCurrentEndpoint) {
                          patch({ endpointTemplate: endpoint.key, model: null }, 'default')
                          if (sessionId) {
                            useStore.getState().setNotice(`已切换为连接「${endpoint.name}」，将在新建会话后生效。`)
                          }
                        }
                      }}
                    >
                      {endpoint.name}
                    </MenuItem>

                    {matchedModels.map((item) => {
                      const isSelected = currentSelection === item.value || (!currentSelection && isCurrentEndpoint && activeConnection?.model === item.value)
                      const itemBadgeMatch = /^(.*?)\s*\[(.*?)\]$/.exec(item.providerModel ?? item.value)
                      const itemTitle = itemBadgeMatch ? itemBadgeMatch[1] : (item.providerModel ?? item.value)
                      const itemBadge = itemBadgeMatch ? itemBadgeMatch[2] : null

                      return (
                        <MenuItem
                          key={item.value}
                          selected={isSelected}
                          description={item.description}
                          onClick={() => {
                            close()
                            const cachedForModel = getCachedEffort(item.value)
                            if (!isCurrentEndpoint) {
                              patch({
                                endpointTemplate: endpoint.key,
                                model: item.value,
                                ...(cachedForModel ? { effort: cachedForModel } : {}),
                              }, 'default')
                              if (sessionId) {
                                useStore.getState().setNotice(`已切换为连接「${endpoint.name}」模型「${itemTitle}」${cachedForModel ? `（已恢复缓存思考：${EFFORT_LABEL[cachedForModel]}）` : ''}，将在新建会话后生效。`)
                              }
                            } else {
                              patch({ model: item.value }, sessionScope)
                              if (cachedForModel && currentEffort === null) {
                                patch({ effort: cachedForModel }, 'default')
                                useStore.getState().setNotice(`已切换模型，并恢复上次记录的思考档位「${EFFORT_LABEL[cachedForModel]}」。`)
                              }
                            }
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {itemTitle}
                            {itemBadge && <span className="model-badge">{itemBadge}</span>}
                          </span>
                        </MenuItem>
                      )
                    })}

                    {matchedModels.length === 0 && (
                      <MenuItem
                        selected={isCurrentEndpoint && currentSelection === null}
                        description="使用该连接声明的默认模型"
                        onClick={() => {
                          close()
                          if (!isCurrentEndpoint) {
                            patch({ endpointTemplate: endpoint.key, model: null }, 'default')
                            if (sessionId) {
                              useStore.getState().setNotice(`已切换为连接「${endpoint.name}」，将在新建会话后生效。`)
                            }
                          } else {
                            patch({ model: null }, sessionScope)
                          }
                        }}
                      >
                        默认模型
                      </MenuItem>
                    )}
                  </div>
                )
              })}

              {endpoints.length === 0 && (
                <p className="menu-empty">尚无已配置连接</p>
              )}

              <div className="menu-sep" />
              <MenuItem
                icon={<IconPlus width={14} height={14} style={{ color: 'var(--color-accent)' }} />}
                onClick={() => {
                  close()
                  onAddConnection()
                }}
                description="填写接口地址与 API Key"
              >
                添加模型连接
              </MenuItem>
            </div>
          )}

          {view === 'effort' && (
            <div className="model-effort-view">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-back-btn"
                  onClick={() => setView('root')}
                  aria-label="返回"
                >
                  <IconChevron width={13} height={13} style={{ transform: 'rotate(90deg)' }} />
                  <span>返回</span>
                </button>
                <span className="model-sub-title">推理等级</span>
              </div>

              <MenuItem
                selected={currentEffort === null}
                onClick={() => {
                  patch({ effort: null }, 'default')
                  saveCachedEffort(null, runtimeModel)
                  setView('root')
                }}
              >
                默认 (Default) - 由服务端或模型决定
              </MenuItem>

              {effortLevels.map((effort) => (
                <MenuItem
                  key={effort}
                  selected={currentEffort === effort}
                  onClick={() => {
                    patch({ effort }, 'default')
                    saveCachedEffort(effort, runtimeModel)
                    setView('root')
                  }}
                >
                  {EFFORT_LABEL[effort]} ({effort.toUpperCase()})
                </MenuItem>
              ))}

              {effortLevels.length === 0 && (
                <p className="menu-empty">当前模型声明不支持推理等级档位调整。</p>
              )}
            </div>
          )}
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
