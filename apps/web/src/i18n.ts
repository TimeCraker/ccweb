/**
 * i18n 全量词典:zh-CN / en-US。
 * 所有 UI 文案经 t() 引用;新增文案先加词典再使用。
 */
import { useSyncExternalStore } from 'react'

export type Locale = 'zh' | 'en'

const ZH = {
  // 侧栏
  'sb.new': '新建会话',
  'sb.search': '搜索会话…',
  'sb.noMatch': '无匹配会话',
  'sb.none': '暂无历史会话',
  'sb.connected': '已连接',
  'sb.connecting': '连接中…',
  'sb.reconnecting': '已断开,重连中…',
  'sb.rename': '重命名',
  'sb.fork': '从此分叉',
  'sb.delete': '删除(不可恢复)',
  'sb.deleteConfirm': (t: string) => `删除会话「${t}」?此操作不可恢复。`,
  'sb.export': '导出对话 Markdown',
  'sb.collapse': '折叠侧栏 (Ctrl+B)',
  'sb.expand': '展开侧栏 (Ctrl+B)',
  'sb.more': (n: number) => `共 ${n} 个会话,展开侧栏查看全部`,
  'sb.untitled': '(无标题)',
  // 输入区
  'cp.placeholder': '给 Claude Code 发送任务…(/ 命令)',
  'cp.busy': '正在生成…按 Esc 中断',
  'cp.hint': 'Enter 发送 · Shift+Enter 换行 · Esc 中断',
  'cp.addImage': '图片附件(可粘贴/拖放)',
  'cp.removeImage': '移除图片',
  'cp.send': '发送',
  'cp.stop': '停止生成',
  'cp.imageOnly': '(图片)',
  // 消息流
  'ms.running': '正在处理…',
  'ms.regenerate': '重新生成',
  'ms.copy': '复制',
  'ms.copied': '已复制',
  'ms.toBottom': '回到底部',
  'ms.copyCode': '复制代码',
  // 指标
  'mt.turns': '轮数',
  'mt.ttft': 'TTFT',
  'mt.speed': '速度',
  'mt.cache': '缓存命中',
  'mt.cost': '成本',
  // 右栏
  'ctx.title': '上下文',
  'ctx.waiting': '对话开始后显示上下文水位',
  'ctx.warn': (p: number) => `上下文已用 ${p}% — 临近自动压缩,长会话建议新建或让模型 /compact`,
  'ctx.composition': 'Token 构成',
  'ctx.fresh': '原始输入',
  'ctx.cacheRead': '缓存读',
  'ctx.cacheWrite': '缓存写',
  'ctx.afterChat': '对话后显示',
  'ctx.total': '会话累计',
  'ctx.output': '输出',
  // 审批
  'pm.title': '操作需要确认',
  'pm.danger': '高危操作需要确认',
  'pm.deny': '拒绝',
  'pm.always': '总是允许',
  'pm.allow': '允许',
  'pm.confirm': '请确认后继续',
  // 工具卡
  'tl.params': '参数',
  'tl.result': '结果',
  'tl.running': '执行中',
  'tl.done': '完成',
  'tl.error': '失败',
  'tl.streaming': '参数',
  'tl.receiving': '(流式接收中…)',
  'tl.truncated': '(截断,完整结果见终端会话)',
  // 思考
  'th.thinking': '思考中…',
  'th.thought': (n: number) => `已思考(${n} 行)`,
  // 设置
  'st.title': '设置',
  'st.tab.model': '模型',
  'st.tab.endpoint': '端点',
  'st.tab.permission': '权限',
  'st.tab.skills': 'Skills',
  'st.tab.rules': '规则',
  'st.tab.mcp': 'MCP',
  'st.model.active': '当前生效(settings.json):',
  'st.model.default': '默认',
  'st.model.apply': '应用',
  'st.model.placeholder': '自定义模型 ID,如 glm-4.7',
  'st.model.note': '留空则用端点默认模型;别名(opus/sonnet/haiku)由端点映射。',
  'st.model.effort': '思考力度',
  'st.model.effortNote': '新会话生效',
  'st.ep.active': '当前生效(读 ~/.claude/settings.json 真值):',
  'st.ep.switch': '切换模板(来自 cc-toolkit,新会话生效;URL 明文可见):',
  'st.ep.noUrl': '(无 URL)',
  'st.ep.note': '模板内容与实际不符?那是 cc-toolkit/settings/settings.<name>.json 的配置——在设置里改它不如直接改模板文件。',
  'st.pm.note1': 'default 按需询问(推荐)· acceptEdits 自动接受编辑 · plan 只读规划 · bypassPermissions 全放行(危险)',
  'st.skills.count': (n: number) => `用户 Skills(${n})· 全部自动生效`,
  'st.skills.enabled': '启用',
  'st.skills.none': '~/.claude/skills 下暂无技能',
  'st.rules.title': '全局规则(每会话全量加载)',
  'st.rules.claudeMd': 'CLAUDE.md(全局指令)',
  'st.rules.noMd': '(未找到 ~/.claude/CLAUDE.md)',
  'st.rules.chars': (n: number) => `${(n / 1000).toFixed(1)}k 字符`,
  'st.mcp.refresh': '刷新状态',
  'st.mcp.none': '发送一条消息后可查询;MCP 服务配置在 ~/.claude/settings.json 的 mcpServers 段。',
  // 顶栏
  'tp.theme': '主题',
  'tp.themeDark': '深色',
  'tp.themeLight': '浅色',
  'tp.themeSystem': '跟随系统',
  'tp.themeCurrent': (s: string) => `当前 ${s}`,
  'tp.settings': '设置 (Ctrl+,)',
  // hero
  'hero.title': '今天做点什么?',
  'hero.sub': '完整 ~/.claude 配置已就绪 · 你的 skills / memory / MCP 自动生效',
  'hero.palette': '命令面板',
  'hero.newSession': '新建会话',
  'hero.interrupt': '中断生成',
  'hero.settings': '设置',
  // 命令面板
  'palette.placeholder': '输入命令或搜索会话…',
  'palette.empty': '无匹配结果',
  'palette.cmd.newSession': '新建会话',
  'palette.cmd.settings': '打开设置',
  'palette.cmd.theme': '切换深浅主题',
  'palette.cmd.lang': '切换语言 / Switch language',
  'palette.sessions': '会话',
  'palette.commands': '命令',
  'palette.workspaces': '工作区',
  'palette.switchWs': (n: string) => `切换工作区:${n}`,
  'palette.launchDir': '启动目录(当前)',
  // 断线
  'conn.reconnecting': '连接已断开,正在重连…',
  // 错误
  'err.crashTitle': '界面发生错误',
  'err.reload': '重新加载',
  'err.dismiss': '关闭',
  'err.noExport': '当前没有可导出的对话',
  // 工作区
  'ws.title': '启动目录',
  'ws.none': '暂无历史工作区',
  'ws.sessions': (n: number) => `${n} 会话`,
  // 时间
  'time.now': '刚刚',
  'time.min': (n: number) => `${n} 分钟前`,
  'time.hour': (n: number) => `${n} 小时前`,
  'time.day': (n: number) => `${n} 天前`,
}

export type Dict = typeof ZH

const EN: Dict = {
  'sb.new': 'New session',
  'sb.search': 'Search sessions…',
  'sb.noMatch': 'No matching sessions',
  'sb.none': 'No sessions yet',
  'sb.connected': 'Connected',
  'sb.connecting': 'Connecting…',
  'sb.reconnecting': 'Disconnected, reconnecting…',
  'sb.rename': 'Rename',
  'sb.fork': 'Fork from here',
  'sb.delete': 'Delete (irreversible)',
  'sb.deleteConfirm': (t: string) => `Delete session "${t}"? This cannot be undone.`,
  'sb.export': 'Export conversation as Markdown',
  'sb.collapse': 'Collapse sidebar (Ctrl+B)',
  'sb.expand': 'Expand sidebar (Ctrl+B)',
  'sb.more': (n: number) => `${n} sessions total — expand sidebar to see all`,
  'sb.untitled': '(untitled)',
  'cp.placeholder': 'Send a task to Claude Code… (/ commands)',
  'cp.busy': 'Generating… press Esc to interrupt',
  'cp.hint': 'Enter send · Shift+Enter newline · Esc interrupt',
  'cp.addImage': 'Image attachments (paste / drop)',
  'cp.removeImage': 'Remove image',
  'cp.send': 'Send',
  'cp.stop': 'Stop generating',
  'cp.imageOnly': '(image)',
  'ms.running': 'Working…',
  'ms.regenerate': 'Regenerate',
  'ms.copy': 'Copy',
  'ms.copied': 'Copied',
  'ms.toBottom': 'Back to bottom',
  'ms.copyCode': 'Copy code',
  'mt.turns': 'Turns',
  'mt.ttft': 'TTFT',
  'mt.speed': 'Speed',
  'mt.cache': 'Cache hit',
  'mt.cost': 'Cost',
  'ctx.title': 'Context',
  'ctx.waiting': 'Context gauge appears after the first message',
  'ctx.warn': (p: number) => `Context at ${p}% — nearing auto-compaction. Start a new session or ask for /compact.`,
  'ctx.composition': 'Token composition',
  'ctx.fresh': 'Fresh input',
  'ctx.cacheRead': 'Cache read',
  'ctx.cacheWrite': 'Cache write',
  'ctx.afterChat': 'Appears after a turn',
  'ctx.total': 'Session totals',
  'ctx.output': 'Output',
  'pm.title': 'Action needs confirmation',
  'pm.danger': 'Dangerous action needs confirmation',
  'pm.deny': 'Deny',
  'pm.always': 'Always allow',
  'pm.allow': 'Allow',
  'pm.confirm': 'Review, then continue',
  'tl.params': 'Arguments',
  'tl.result': 'Result',
  'tl.running': 'Running',
  'tl.done': 'Done',
  'tl.error': 'Failed',
  'tl.streaming': 'Args',
  'tl.receiving': '(receiving…)',
  'tl.truncated': '(truncated — see terminal for full output)',
  'th.thinking': 'Thinking…',
  'th.thought': (n: number) => `Thought (${n} lines)`,
  'st.title': 'Settings',
  'st.tab.model': 'Model',
  'st.tab.endpoint': 'Endpoint',
  'st.tab.permission': 'Permission',
  'st.tab.skills': 'Skills',
  'st.tab.rules': 'Rules',
  'st.tab.mcp': 'MCP',
  'st.model.active': 'Active (settings.json):',
  'st.model.default': 'default',
  'st.model.apply': 'Apply',
  'st.model.placeholder': 'Custom model id, e.g. glm-4.7',
  'st.model.note': 'Empty = endpoint default; aliases (opus/sonnet/haiku) map at the endpoint.',
  'st.model.effort': 'Effort',
  'st.model.effortNote': 'applies to new sessions',
  'st.ep.active': 'Active (read from ~/.claude/settings.json):',
  'st.ep.switch': 'Switch template (from cc-toolkit; applies to new sessions; URLs shown in full):',
  'st.ep.noUrl': '(no URL)',
  'st.ep.note': 'Template out of date? Edit cc-toolkit/settings/settings.<name>.json directly.',
  'st.pm.note1': 'default asks (recommended) · acceptEdits auto-accepts edits · plan read-only · bypassPermissions grants everything (dangerous)',
  'st.skills.count': (n: number) => `User skills (${n}) · all active`,
  'st.skills.enabled': 'active',
  'st.skills.none': 'No skills under ~/.claude/skills',
  'st.rules.title': 'Global rules (loaded every session)',
  'st.rules.claudeMd': 'CLAUDE.md (global instructions)',
  'st.rules.noMd': '(~/.claude/CLAUDE.md not found)',
  'st.rules.chars': (n: number) => `${(n / 1000).toFixed(1)}k chars`,
  'st.mcp.refresh': 'Refresh status',
  'st.mcp.none': 'Send a message first; MCP servers are configured in ~/.claude/settings.json (mcpServers).',
  'tp.theme': 'Theme',
  'tp.themeDark': 'dark',
  'tp.themeLight': 'light',
  'tp.themeSystem': 'follow system',
  'tp.themeCurrent': (s: string) => `current ${s}`,
  'tp.settings': 'Settings (Ctrl+,)',
  'hero.title': 'What are we building today?',
  'hero.sub': 'Your full ~/.claude setup is live — skills / memory / MCP apply automatically',
  'hero.palette': 'Command palette',
  'hero.newSession': 'New session',
  'hero.interrupt': 'Interrupt',
  'hero.settings': 'Settings',
  'palette.placeholder': 'Type a command or search sessions…',
  'palette.empty': 'No results',
  'palette.cmd.newSession': 'New session',
  'palette.cmd.settings': 'Open settings',
  'palette.cmd.theme': 'Cycle theme',
  'palette.cmd.lang': '切换语言 / Switch language',
  'palette.sessions': 'Sessions',
  'palette.commands': 'Commands',
  'palette.workspaces': 'Workspaces',
  'palette.switchWs': (n: string) => `Switch workspace: ${n}`,
  'palette.launchDir': 'Launch directory (current)',
  'conn.reconnecting': 'Connection lost — reconnecting…',
  'err.crashTitle': 'Something went wrong',
  'err.reload': 'Reload',
  'err.dismiss': 'Dismiss',
  'err.noExport': 'Nothing to export yet',
  'ws.title': 'Launch directory',
  'ws.none': 'No recent workspaces',
  'ws.sessions': (n: number) => `${n} sessions`,
  'time.now': 'just now',
  'time.min': (n: number) => `${n} min ago`,
  'time.hour': (n: number) => `${n} h ago`,
  'time.day': (n: number) => `${n} d ago`,
}

const DICT: Record<Locale, Dict> = { zh: ZH, en: EN }

export type DictKey = keyof Dict

const listeners = new Set<() => void>()
let current: Locale = readInitialLocale()

function readInitialLocale(): Locale {
  const saved = localStorage.getItem('ccweb.locale')
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.startsWith('zh') ? 'zh' : 'en'
}

export function setLocale(l: Locale): void {
  current = l
  localStorage.setItem('ccweb.locale', l)
  for (const cb of listeners) cb()
}

export function toggleLocale(): void {
  setLocale(current === 'zh' ? 'en' : 'zh')
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

type Value<K extends DictKey> = Dict[K]

/** 翻译:静态词条 */
export function t<K extends DictKey>(key: K, locale: Locale = current): Value<K> {
  return DICT[locale][key] as Value<K>
}

/** 翻译:带参词条 */
export function tf<K extends DictKey>(
  key: K,
  ...args: Parameters<Extract<Value<K>, (...a: never[]) => unknown>>
): string {
  const v = DICT[current][key] as unknown as (...a: unknown[]) => string
  return typeof v === 'function' ? v(...args) : String(v)
}
