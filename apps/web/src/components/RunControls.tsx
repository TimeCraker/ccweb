import { useStore } from '../store'
const modes = [['default', '手动审批'], ['auto', '自动模式'], ['plan', '计划模式'], ['bypassPermissions', '运行一切'], ['acceptEdits', '接受编辑']] as const
export default function RunControls({ send }: { send: (message: Record<string, unknown>) => void }) {
  const settings = useStore(s => s.settings)
  const model = useStore(s => s.model)
  const conn = useStore(s => s.conn)
  const patch = (value: Record<string, unknown>) => send({ t: 'settings.patch', patch: value })
  return <div className="run-controls">
    <label><span className="sr-only">运行模式</span><select aria-label="运行模式" disabled={conn !== 'open' || !settings} value={settings?.active?.permissionMode ?? settings?.permissionMode ?? 'default'} onChange={e => { if (e.target.value !== 'bypassPermissions' || window.confirm('确认开启运行一切？这会跳过常规工具审批。')) patch({ permissionMode: e.target.value }) }}>{modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><span className="sr-only">模型</span><select aria-label="模型" disabled={conn !== 'open' || !settings} value={settings?.active?.model ?? settings?.model ?? ''} onChange={e => patch({ model: e.target.value || null })}><option value="">{model ?? settings?.currentModel ?? '继承模型'}</option>{[...new Set(['sonnet', 'opus', 'haiku', ...(settings?.model ? [settings.model] : [])])].map(value => <option key={value}>{value}</option>)}</select></label>
    <label><span className="sr-only">思考力度</span><select aria-label="思考力度" disabled={conn !== 'open' || !settings} value={settings?.effort ?? ''} onChange={e => patch({ effort: e.target.value || null })}><option value="">默认思考</option>{['low', 'medium', 'high', 'xhigh', 'max'].map(value => <option key={value}>{value}</option>)}</select></label>
  </div>
}
