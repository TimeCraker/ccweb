/**
 * P1 冒烟:工具调用全链路 —— block(tool_use)/input 流式/审批往返/工具结果回填。
 * 用法:node scripts/e2e-tools.mjs [超时秒数,默认 120]
 */
import WebSocket from 'ws'

const URL = 'ws://127.0.0.1:3477/ws'
const TIMEOUT_MS = Number(process.argv[2] ?? 120) * 1000

const seen = {
  toolStart: 0,
  toolInputDelta: 0,
  permissionAsk: 0,
  permissionResolve: 0,
  toolResult: 0,
  assistantFull: 0,
  result: false,
  context: false,
  text: 0,
  error: null,
}

const ws = new WebSocket(URL)
const timer = setTimeout(() => {
  console.error('[tools-smoke] TIMEOUT')
  finish(1)
}, TIMEOUT_MS)

function finish(code) {
  clearTimeout(timer)
  console.log('\n[tools-smoke] report:', JSON.stringify(seen))
  ws.close()
  process.exit(code)
}

function check() {
  if (!seen.result || seen.error) return
  const ok =
    seen.toolStart > 0 &&
    seen.permissionAsk > 0 &&
    seen.permissionResolve > 0 &&
    seen.toolResult > 0 &&
    seen.assistantFull > 0
  console.log(ok ? '[tools-smoke] ✅ PASS' : '[tools-smoke] ❌ FAIL (missing stages)')
  finish(ok ? 0 : 1)
}

ws.on('open', () => {
  console.log('[tools-smoke] connected, sending tool task…')
  ws.send(
    JSON.stringify({
      t: 'prompt',
      text: '运行命令 "echo ccweb-p1-smoke" 并告诉我输出。需要工具时直接调用。',
    }),
  )
})

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw))
  switch (msg.t) {
    case 'block':
      if (msg.action === 'start' && msg.blockType === 'tool_use') {
        seen.toolStart++
        console.log(`[tools-smoke] tool_use start: ${msg.toolName}`)
      }
      break
    case 'delta':
      if (msg.kind === 'tool_input') seen.toolInputDelta++
      if (msg.kind === 'text') seen.text++
      break
    case 'permission.ask':
      seen.permissionAsk++
      console.log(`[tools-smoke] permission.ask: ${msg.toolName} -> auto-allow`)
      // 自动允许(模拟用户点击)
      ws.send(JSON.stringify({ t: 'permission.resolve', requestId: msg.requestId, allow: true }))
      seen.permissionResolve++
      break
    case 'permission.resolved':
      break
    case 'message': {
      const sm = msg.sdkMessage
      if (sm?.type === 'user') {
        const content = sm.message?.content
        if (Array.isArray(content) && content.some((c) => c?.type === 'tool_result')) {
          seen.toolResult++
          console.log('[tools-smoke] tool_result received')
        }
      } else if (sm?.type === 'assistant') {
        seen.assistantFull++
      } else if (sm?.type === 'result') {
        seen.result = true
        console.log(`[tools-smoke] result: ${sm.subtype}`)
        check()
      }
      break
    }
    case 'context':
      seen.context = true
      console.log('[tools-smoke] context usage:', JSON.stringify(msg.usage).slice(0, 200))
      break
    case 'error':
      seen.error = msg.message
      console.error(`[tools-smoke] error: ${msg.code} ${msg.message}`)
      break
  }
})

ws.on('error', (err) => {
  console.error('[tools-smoke] ws error:', err.message)
  finish(1)
})
