import { useState } from 'react'
import { useStore } from '../store'
import { t } from '../i18n'
import { IconChevron, IconPlus, IconImage } from './Icon'
import { Menu, MenuItem } from './ui/Menu'

type Send = (message: Record<string, unknown>) => void

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
  const template = settings?.endpointTemplate
  const matched = template ? settings?.endpoints.find((item) => item.key === template) : undefined
  const endpoint = activeEndpoint ?? settings?.currentEndpoint ?? settings?.endpoints[0]?.baseUrl ?? null
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

export function currentModelOf(settings: ReturnType<typeof useStore.getState>['settings'], live: string | null): string | null {
  return settings?.active?.model ?? live ?? settings?.model ?? settings?.currentModel ?? null
}

/** 工作方式菜单:逐步确认 / 先做计划 / 自动处理 + 高级权限 */
export function ModeMenu({ send, disabled }: { send: Send; disabled?: boolean }) {
  const settings = useStore((s) => s.settings)
  const value = settings?.active?.permissionMode ?? settings?.permissionMode ?? 'default'
  const patch = (next: string) => send({ t: 'settings.patch', patch: { permissionMode: next } })
  return (
    <Menu
      label={t('cp.mode')}
      width={292}
      trigger={({ open }) => (
        <button className="chip-btn" aria-expanded={open} aria-label={t('cp.mode')} title={t('cp.mode')} disabled={disabled}>
          <span className="chip-label">{modeLabel(value)}</span>
          <IconChevron width={12} height={12} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">{t('mode.title')}</div>
          {MODE_META.filter((item) => !ADVANCED.has(item.value)).map((item) => (
            <MenuItem
              key={item.value}
              selected={value === item.value}
              description={t(item.desc)}
              onClick={() => {
                close()
                patch(item.value)
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
              selected={value === item.value}
              description={t(item.desc)}
              onClick={() => {
                if (item.value === 'bypassPermissions' && !window.confirm(t('mode.confirmBypass'))) return
                close()
                patch(item.value)
              }}
            >
              {t(item.label)}
            </MenuItem>
          ))}
          <p className="menu-foot-note">修改由运行时确认；不接受时保持原值。</p>
        </>
      )}
    </Menu>
  )
}

/** 模型菜单:已配置连接 + 模型 + 思考力度 + 添加入口 */
export function ModelMenu({ send, onAddConnection }: { send: Send; onAddConnection: () => void }) {
  const settings = useStore((s) => s.settings)
  const liveModel = useStore((s) => s.model)
  const availableModels = useStore((s) => s.availableModels)
  const conn = useStore((s) => s.conn)
  const { name: connectionName } = useConnectionLabel()
  const templates = settings?.endpointTemplate ?? null
  const activeConnection = templates ? settings?.endpoints.find((endpoint) => endpoint.key === templates) : undefined
  const model = currentModelOf(settings, liveModel) ?? activeConnection?.model ?? null
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const patch = (value: Record<string, unknown>) => send({ t: 'settings.patch', patch: value })
  const endpoints = settings?.endpoints ?? []
  const activeMode = settings?.effort ?? null
  const currentEffort = settings?.active?.effort ?? activeMode
  const models = [
    ...(settings?.model ? [{ value: settings.model, displayName: settings.model, description: '默认模型' }] : []),
    ...availableModels,
  ].filter((item, index, list) => list.findIndex((other) => other.value === item.value) === index)
  const visibleModels = models.filter(
    (item) => !query || item.value.toLowerCase().includes(query.toLowerCase()) || item.displayName.toLowerCase().includes(query.toLowerCase()),
  )
  const disabled = conn !== 'open' || !settings

  const triggerLabel = model ? `${connectionName ? `${connectionName} · ` : ''}${model}` : '选择模型'

  return (
    <Menu
      label={t('cp.model')}
      width={330}
      align="end"
      trigger={({ open }) => (
        <button
          className={`chip-btn model-chip ${model ? '' : 'warn'}`}
          aria-expanded={open}
          aria-label={t('cp.model')}
          title={model ?? t('cp.needConnection')}
          disabled={disabled && !open}
        >
          <span className="chip-label">{triggerLabel}</span>
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

          {query === '' && (
            <>
              <div className="menu-label">已配置连接</div>
              {endpoints.length === 0 && <p className="menu-empty">尚无已配置连接</p>}
              {endpoints.map((endpoint) => (
                <MenuItem
                  key={endpoint.key}
                  selected={templates === endpoint.key}
                  description={endpoint.baseUrl ?? '地址未记录'}
                  onClick={() => {
                    close()
                    patch({ endpointTemplate: endpoint.key, model: null })
                  }}
                >
                  {endpoint.name}
                </MenuItem>
              ))}
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
              <div className="menu-sep" />
            </>
          )}

          <div className="menu-label">模型</div>
          <MenuItem
            selected={!settings?.model}
            description={
              activeConnection?.model
                ? `由连接决定：${activeConnection.model}`
                : '由连接决定，切换连接时恢复'
            }
            onClick={() => {
              close()
              patch({ model: null })
            }}
          >
            使用连接默认
          </MenuItem>
          {visibleModels.length === 0 && (
            <p className="menu-empty">
              {query ? '没有匹配的模型' : '使用连接默认模型即可；运行一次任务后也会自动发现可用模型。'}
            </p>
          )}
          {visibleModels.map((item) => (
            <MenuItem
              key={item.value}
              selected={settings?.model === item.value}
              description={item.description || item.displayName}
              onClick={() => {
                close()
                patch({ model: item.value })
              }}
            >
              {item.value}
            </MenuItem>
          ))}
          {activeMode !== null && (
            <>
              <div className="menu-sep" />
              <div className="menu-label">思考力度</div>
              <div className="effort-row">
                <button
                  className={`effort-pill ${currentEffort == null ? 'is-active' : ''}`}
                  onClick={() => patch({ effort: null })}
                >
                  默认
                </button>
                {EFFORTS.map((effort) => (
                  <button
                    key={effort}
                    className={`effort-pill ${currentEffort === effort ? 'is-active' : ''}`}
                    onClick={() => patch({ effort })}
                  >
                    {EFFORT_LABEL[effort]}
                  </button>
                ))}
              </div>
              <p className="menu-foot-note">运行时未明确支持时，保持默认更安全。</p>
            </>
          )}

          <div className="menu-sep" />
          <form
            className="custom-model"
            onSubmit={(e) => {
              e.preventDefault()
              if (!custom.trim()) return
              close()
              patch({ model: custom.trim() })
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
            也可以直接拖入或粘贴图片。
          </p>
        </>
      )}
    </Menu>
  )
}
