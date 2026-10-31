// Test-only simulated SDK. Loaded through fixture-server, never from production code.
import { readFileSync } from 'node:fs'
const sessions = new Map()
const histories = new Map()
const titles = new Map()
export async function listSessions() { return [...sessions.keys()].map(sessionId => ({ sessionId, firstPrompt: titles.get(sessionId) ?? '【E2E】 simulated task', lastModified: Date.now() })) }
export async function getSessionMessages(sessionId) { return histories.get(sessionId) ?? [] }
export async function renameSession() {}
export async function deleteSession(id) { sessions.delete(id); histories.delete(id) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export function query({ prompt, options }) {
  const sid = options.resume ?? options.sessionId ?? crypto.randomUUID()
  sessions.set(sid, true)
  let interrupted = false
  const query = (async function* () {
    await sleep(300)
    yield { type: 'system', subtype: 'init', session_id: sid, model: options.model ?? 'fixture-model', slash_commands: ['compact'], claude_code_version: 'fixture' }
    for await (const user of prompt) {
      const text = typeof user.message.content === 'string' ? user.message.content : user.message.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
      if (text.includes('SEED_HISTORY')) {
        const seeded = []
        for (let i = 0; i < 100; i++) {
          seeded.push(
            { type: 'user', uuid: crypto.randomUUID(), message: { content: `历史问题 ${i}` } },
            { type: 'assistant', uuid: crypto.randomUUID(), message: { id: crypto.randomUUID(), role: 'assistant', content: [{ type: 'text', text: `历史回答 ${i}` }] } },
          )
        }
        const seedId = crypto.randomUUID()
        sessions.set(seedId, true)
        histories.set(seedId, seeded)
        titles.set(seedId, '历史会话（200 条）')
      }
      if (text.includes('SDK_ERROR')) { yield { type: 'assistant', error: 'rate_limit', message: { id: crypto.randomUUID(), content: [{type:'text',text:'API Error: fixture rejected'}] } }; yield {type:'result',subtype:'success',session_id:sid};continue }
      if (text.includes('CRASH')) throw new Error('【E2E】 simulated crash')
      const id = crypto.randomUUID()
      yield { type: 'stream_event', event: { type: 'message_start', message: { id } } }
      yield { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }
      await sleep(40)
      yield { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '【E2E】模拟执行已开始。' } } }
      await sleep(100)
      yield { type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 30 } } }
      yield { type: 'stream_event', event: { type: 'message_stop' } }
      if (text.includes('VISUAL') || text.includes('视觉验收')) {
        yield { type:'assistant',uuid:crypto.randomUUID(),message:{id,content:[{type:'text',text:'【E2E 视觉验收 · 模拟 SDK】\n\n我会先核对权限与会话状态，再补齐模式切换。\n\n1. 检查现有的模式切换代码，梳理计划模式和自动模式的实现位置。\n2. 在保留现有文件改动的前提下，完善模式选择与运行回执。\n3. 执行检查，确认原有会话和配置管理仍可使用。'}]} }
        const toolId=crypto.randomUUID()
        yield { type:'assistant',uuid:crypto.randomUUID(),message:{id,content:[{type:'tool_use',id:toolId,name:'Read',input:{file_path:'apps/server/src/agent.ts'}}]} }
        const lines=readFileSync(new URL('../src/agent.ts',import.meta.url),'utf8').split('\n');const start=lines.findIndex(line=>line.startsWith('export class AgentSession'));const code=lines.slice(start,start+18).join('\n')
        yield {type:'user',message:{content:[{type:'tool_result',tool_use_id:toolId,content:code}]}}
      }
      if (text.includes('APPROVAL') || text.includes('PLAN') || text.includes('QUESTION')) {
        const name = text.includes('PLAN') ? 'ExitPlanMode' : text.includes('QUESTION') ? 'AskUserQuestion' : 'Edit'
        const input = name === 'ExitPlanMode' ? (text.includes('EMPTY_PLAN') ? {} : { plan: '# E2E 计划\n\n1. 审查文件\n2. 人工审批后执行' }) : name === 'AskUserQuestion' ? { questions: [{ question: '选择测试方案', header: '测试', multiSelect: false, options: [{ label: '方案 A' }, { label: '方案 B' }] }] } : { file_path: 'fixture.txt', old_string: 'before', new_string: 'after' }
        const toolId = crypto.randomUUID()
        yield { type: 'assistant', uuid: crypto.randomUUID(), message: { id, content: [{ type: 'tool_use', id: toolId, name, input }] } }
        const result = await options.canUseTool(name, input, { toolUseID: toolId, requestId: toolId, signal: options.abortController.signal })
        yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: result.behavior === 'allow' ? '【E2E】approved' : '【E2E】denied', is_error: result.behavior !== 'allow' }] } }
      }
      if (text.includes('MANY_CHANGES')) {
        for (let i = 0; i < 120; i++) {
          const toolId = crypto.randomUUID()
          yield { type: 'assistant', uuid: crypto.randomUUID(), message: { id: crypto.randomUUID(), content: [{ type: 'tool_use', id: toolId, name: 'Edit', input: { file_path: `fixture/file-${i}.ts`, old_string: 'a', new_string: 'b' } }] } }
          yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: 'ok' }] } }
        }
      }
      if (text.includes('WAIT') || text.includes('视觉验收')) { for (let i = 0; i < 100 && !interrupted && !options.abortController.signal.aborted; i++) await sleep(100) }
      if (options.abortController.signal.aborted) return
      const wasInterrupted = interrupted
      interrupted = false
      yield { type: 'assistant', uuid: crypto.randomUUID(), message: { id, content: [{ type: 'text', text: `【E2E】模拟完成：${text}` }] } }
      const history = histories.get(sid) ?? []
      history.push(
        { type: 'user', uuid: crypto.randomUUID(), message: { content: text } },
        { type: 'assistant', uuid: crypto.randomUUID(), message: { id: crypto.randomUUID(), role: 'assistant', content: [{ type: 'text', text: `【E2E】模拟完成：${text}` }] } },
      )
      histories.set(sid, history)
      yield { type: 'result', subtype: 'success', is_error: wasInterrupted, duration_ms: 200, usage: { output_tokens: 30 }, modelUsage: { fixture: { inputTokens: 50, outputTokens: 30, contextWindow: 1000 } }, total_cost_usd: 0, session_id: sid }
    }
  })()
  return Object.assign(query, { interrupt: async () => { interrupted = true }, close: () => undefined, setModel: async model => { if (model === 'audit-reject-model') throw new Error('【E2E】model rejected') }, setPermissionMode: async mode => { if (mode === 'auto') throw new Error('【E2E】auto unavailable') }, supportedModels: async () => [{ value: 'fixture-discovered', displayName: 'Discovered fixture model', description: 'Simulated discovery', supportsEffort: true, supportedEffortLevels: ['low', 'high'] }], reconnectMcpServer: async () => {}, toggleMcpServer: async () => {}, rewindFiles: async () => ({ canRewind: true, filesChanged: ['fixture-file.ts'], insertions: 1, deletions: 2 }), stopTask: async () => {}, mcpServerStatus: async () => [{ name: 'fixture-mcp', status: 'connected' }], getContextUsage: async () => ({ usage: { total_tokens: 260, raw_max_tokens: 1000, percentage: 26, categories: [] } }) })
}

export async function forkSession() { const sessionId = crypto.randomUUID(); sessions.set(sessionId, true); return { sessionId } }
