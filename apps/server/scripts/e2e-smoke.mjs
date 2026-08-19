/**
 * P0 冒烟:WS 连接 → prompt → 流式 delta → metrics → result 全链路验证。
 * 用法:node scripts/e2e-smoke.mjs [超时秒数,默认 90]
 */
import WebSocket from 'ws'

const URL = 'ws://127.0.0.1:3477/ws'
const TIMEOUT_MS = Number(process.argv[2] ?? 90) * 1000

const seen = { init: false, delta: 0, metrics: false, result: false, error: null }
let firstDeltaAt = 0

const ws = new WebSocket(URL)
const timer = setTimeout(() => {
  console.error('[smoke] TIMEOUT')
  report(1)
}, TIMEOUT_MS)

function report(code) {
  clearTimeout(timer)
  console.log('\n[smoke] report:', JSON.stringify(seen))
  ws.close()
  process.exit(code)
}

ws.on('open', () => {
  console.log('[smoke] connected, sending prompt…')
  ws.send(JSON.stringify({ t: 'prompt', text: '用一句话回答:1+1 等于几?不要使用任何工具。' }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw))
  switch (msg.t) {
    case 'init':
      seen.init = true
      console.log(`[smoke] init: session=${msg.sessionId} model=${msg.model} endpoint=${msg.endpoint}`)
      break
    case 'delta':
      if (seen.delta === 0) {
        firstDeltaAt = Date.now()
        console.log(`[smoke] first delta after ${firstDeltaAt} <streaming…>`)
      }
      seen.delta++
      process.stdout.write(msg.text ?? '')
      break
    case 'metrics':
      seen.metrics = true
      console.log(`\n[smoke] metrics: ${JSON.stringify(msg.metrics)}`)
      break
    case 'message': {
      const sm = msg.sdkMessage
      if (sm?.type === 'result') {
        seen.result = true
        console.log(`[smoke] result: subtype=${sm.subtype}`)
        const ok =
          seen.init && seen.delta > 0 && seen.metrics && seen.result && !seen.error
        console.log(ok ? '[smoke] ✅ PASS' : '[smoke] ❌ FAIL')
        report(ok ? 0 : 1)
      }
      break
    }
    case 'error':
      seen.error = msg.message
      console.error(`[smoke] server error: ${msg.code} ${msg.message}`)
      break
  }
})

ws.on('error', (err) => {
  console.error('[smoke] ws error:', err.message)
  report(1)
})
