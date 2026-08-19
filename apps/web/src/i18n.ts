/**
 * 轻量 i18n:zh-CN / en-US 双语,默认跟随系统,localStorage 记忆。
 * 企业级要求界面双语;词典集中在此,组件经 t() 引用。
 */
import { useSyncExternalStore } from 'react'

export type Locale = 'zh' | 'en'

const DICT = {
  zh: {
    'app.name': 'ccweb',
    'app.newSession': '新建会话',
    'app.searchSessions': '搜索会话…',
    'app.history': '历史',
    'app.noSessions': '暂无历史会话',
    'app.noMatch': '无匹配会话',
    'app.connected': '已连接',
    'app.connecting': '连接中…',
    'app.disconnected': '已断开,重连中…',
    'app.startTitle': '开始新对话',
    'app.startHint': '输入任务,回车发送 · Esc 中断 · 完整 ~/.claude 配置自动生效',
    'composer.placeholder': '给 Claude Code 发送任务…',
    'composer.busyPlaceholder': '正在生成…按 Esc 中断',
    'composer.send': '发送',
    'composer.stop': '停止',
    'composer.hint': 'Enter 发送 · Shift+Enter 换行 · Esc 中断',
    'metrics.turns': '轮数',
    'metrics.ttft': 'TTFT',
    'metrics.speed': '速度',
    'metrics.cache': '缓存命中',
    'metrics.cost': '成本',
    'ctx.title': '上下文',
    'ctx.waiting': '对话开始后显示上下文水位',
    'ctx.stats': '会话统计',
    'ctx.input': '输入',
    'ctx.output': '输出',
    'ctx.cacheRead': '缓存读',
    'ctx.cacheWrite': '缓存写',
    'perm.title': '操作需要确认',
    'perm.dangerTitle': '高危操作需要确认',
    'perm.deny': '拒绝',
    'perm.always': '总是允许',
    'perm.allow': '允许',
    'perm.confirm': '请确认后继续',
    'tool.running': '执行中',
    'tool.done': '完成',
    'tool.error': '失败',
    'tool.streaming': '参数',
    'tool.params': '参数',
    'tool.result': '结果',
    'tool.thinking': '思考中…',
    'tool.thought': (n: number) => `已思考(${n} 行)`,
    'palette.placeholder': '输入命令或搜索会话…',
    'palette.empty': '无匹配结果',
    'palette.cmd.newSession': '新建会话',
    'palette.cmd.settings': '打开设置',
    'palette.cmd.theme': '切换深浅主题',
    'palette.cmd.lang': '切换语言 / Switch language',
    'palette.sessions': '会话',
    'settings.title': '设置',
    'settings.model': '模型',
    'settings.effort': '思考力度',
    'settings.permission': '权限模式',
    'settings.endpoint': 'API 端点',
    'settings.endpointHint': '切换端点将在新会话生效(子进程环境变量)',
    'settings.current': '当前生效',
    'settings.mcp': 'MCP 服务',
    'settings.mcpEmpty': '暂无 MCP 服务状态(发送一条消息后可查询)',
    'settings.effortHint': '新会话生效',
    'settings.close': '关闭',
    'settings.queryMcp': '查询 MCP 状态',
    'copied': '已复制',
    'copy': '复制',
  },
  en: {
    'app.name': 'ccweb',
    'app.newSession': 'New session',
    'app.searchSessions': 'Search sessions…',
    'app.history': 'History',
    'app.noSessions': 'No sessions yet',
    'app.noMatch': 'No matching sessions',
    'app.connected': 'Connected',
    'app.connecting': 'Connecting…',
    'app.disconnected': 'Disconnected, reconnecting…',
    'app.startTitle': 'Start a new conversation',
    'app.startHint': 'Type a task, Enter to send · Esc to interrupt · Your ~/.claude config applies automatically',
    'composer.placeholder': 'Send a task to Claude Code…',
    'composer.busyPlaceholder': 'Generating… press Esc to interrupt',
    'composer.send': 'Send',
    'composer.stop': 'Stop',
    'composer.hint': 'Enter send · Shift+Enter newline · Esc interrupt',
    'metrics.turns': 'Turns',
    'metrics.ttft': 'TTFT',
    'metrics.speed': 'Speed',
    'metrics.cache': 'Cache hit',
    'metrics.cost': 'Cost',
    'ctx.title': 'Context',
    'ctx.waiting': 'Context usage appears after the first message',
    'ctx.stats': 'Session stats',
    'ctx.input': 'Input',
    'ctx.output': 'Output',
    'ctx.cacheRead': 'Cache read',
    'ctx.cacheWrite': 'Cache write',
    'perm.title': 'Action needs confirmation',
    'perm.dangerTitle': 'Dangerous action needs confirmation',
    'perm.deny': 'Deny',
    'perm.always': 'Always allow',
    'perm.allow': 'Allow',
    'perm.confirm': 'Review, then continue',
    'tool.running': 'Running',
    'tool.done': 'Done',
    'tool.error': 'Failed',
    'tool.streaming': 'Args',
    'tool.params': 'Arguments',
    'tool.result': 'Result',
    'tool.thinking': 'Thinking…',
    'tool.thought': (n: number) => `Thought (${n} lines)`,
    'palette.placeholder': 'Type a command or search sessions…',
    'palette.empty': 'No results',
    'palette.cmd.newSession': 'New session',
    'palette.cmd.settings': 'Open settings',
    'palette.cmd.theme': 'Toggle light/dark theme',
    'palette.cmd.lang': '切换语言 / Switch language',
    'palette.sessions': 'Sessions',
    'settings.title': 'Settings',
    'settings.model': 'Model',
    'settings.effort': 'Effort',
    'settings.permission': 'Permission mode',
    'settings.endpoint': 'API endpoint',
    'settings.endpointHint': 'Endpoint changes apply to new sessions (subprocess env)',
    'settings.current': 'Active',
    'settings.mcp': 'MCP servers',
    'settings.mcpEmpty': 'No MCP status yet (send a message first)',
    'settings.effortHint': 'Applies to new sessions',
    'settings.close': 'Close',
    'settings.queryMcp': 'Query MCP status',
    'copied': 'Copied',
    'copy': 'Copy',
  },
} as const

export type DictKey = keyof (typeof DICT)['zh']

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

/** 翻译函数:key 查词典;模板值支持参数 */
export function t(key: DictKey, locale: Locale = current): string {
  const dict = DICT[locale] as Record<string, string | ((n: number) => string)>
  const v = dict[key]
  return typeof v === 'function' ? v(0) : (v ?? key)
}

export function tf(key: DictKey, n: number, locale: Locale = current): string {
  const dict = DICT[locale] as Record<string, string | ((n: number) => string)>
  const v = dict[key]
  return typeof v === 'function' ? v(n) : (v ?? key)
}
