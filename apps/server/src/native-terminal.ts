import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { spawn, type IPty } from 'node-pty'
import type { WebSocket } from 'ws'
import { buildAgentEnv } from './agent.js'

export function bundledBinary(): string {
  const require = createRequire(import.meta.resolve('@anthropic-ai/claude-agent-sdk'))
  return join(dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')
}
export const terminalActions = {
  interactive: [], help: ['--help'], doctor: ['doctor'], auth: ['auth', 'status', '--text'],
  login: ['auth', 'login'], mcp: ['mcp', 'list'], plugins: ['plugin', 'list'], agents: ['agents', '--json'],
} satisfies Record<string, string[]>
type Action = keyof typeof terminalActions
interface NativeSession {
  id: string; token: string; workspace: string; process: IPty; action: Action
  output: Array<{ n: number; data: string }>; bytes: number; seq: number; exit: number | null
  socket: WebSocket | null; timer?: ReturnType<typeof setTimeout>
}
const sessions = new Map<string, NativeSession>()
export function nativeWorkspaceBusy(workspace: string): boolean {
  return [...sessions.values()].some(s => s.workspace === workspace && s.exit === null)
}
export function startNative(workspace: string, action: string): { id: string; token: string } {
  if (!Object.hasOwn(terminalActions, action)) throw new Error('未知原生操作')
  if (nativeWorkspaceBusy(workspace)) throw new Error('此工作区已有原生进程，请重新连接或先结束它')
  if (sessions.size >= 16) throw new Error('原生终端数量已达上限，请结束不再使用的进程')
  const id = randomUUID(), token = randomBytes(32).toString('hex')
  const env = Object.fromEntries(Object.entries(buildAgentEnv()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  // Do not let native maintenance replace the SDK's locked binary.
  env.DISABLE_AUTOUPDATER = '1'
  const args: string[] = [...terminalActions[action as Action]]
  if (action === 'interactive') args.push('--session-id', id)
  const process = spawn(bundledBinary(), args, { name: 'xterm-256color', cols: 100, rows: 30, cwd: workspace, env })
  const session: NativeSession = { id, token, workspace, process, action: action as Action, output: [], bytes: 0, seq: 0, exit: null, socket: null }
  sessions.set(id, session)
  const send = (frame: unknown) => { if (session.socket?.readyState === 1) session.socket.send(JSON.stringify(frame)) }
  process.onData(data => {
    const frame = { n: ++session.seq, data }
    session.output.push(frame); session.bytes += Buffer.byteLength(data)
    while (session.bytes > 2 * 1024 * 1024 && session.output.length > 1) session.bytes -= Buffer.byteLength(session.output.shift()!.data)
    send({ t: 'data', ...frame })
  })
  process.onExit(({ exitCode }) => { session.exit = exitCode; send({ t: 'exit', code: exitCode }); expire(session) })
  expire(session)
  return { id, token }
}
function expire(session: NativeSession): void {
  clearTimeout(session.timer)
  if (session.socket) return
  session.timer = setTimeout(() => { if (session.exit === null) session.process.kill(); sessions.delete(session.id) }, 30 * 60_000)
  session.timer.unref()
}
export function attachNative(socket: WebSocket, id: string, token: string, after: number): void {
  const session = sessions.get(id)
  const expected = session ? Buffer.from(session.token) : Buffer.alloc(0), supplied = Buffer.from(token)
  if (!session || supplied.length !== expected.length || !timingSafeEqual(expected, supplied) || session.socket) { socket.close(1008, 'Terminal capability invalid or already attached'); return }
  clearTimeout(session.timer); session.socket = socket
  socket.send(JSON.stringify({ t: 'ready', workspace: session.workspace, action: session.action, replayTruncated: after < (session.output[0]?.n ?? 1) - 1 }))
  for (const frame of session.output) if (frame.n > after) socket.send(JSON.stringify({ t: 'data', ...frame }))
  if (session.exit !== null) socket.send(JSON.stringify({ t: 'exit', code: session.exit }))
  socket.on('message', raw => {
    try {
      const msg = JSON.parse(String(raw)) as { t: string; data?: unknown; cols?: unknown; rows?: unknown }
      if (msg.t === 'close') { if (session.exit === null) session.process.kill(); sessions.delete(id); socket.close(); return }
      if (session.exit !== null) return
      if (msg.t === 'input' && typeof msg.data === 'string' && Buffer.byteLength(msg.data) <= 65536) session.process.write(msg.data)
      if (msg.t === 'resize' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) session.process.resize(Math.max(20, Math.min(500, Number(msg.cols))), Math.max(5, Math.min(200, Number(msg.rows))))
    } catch { socket.send(JSON.stringify({ t: 'error', message: '无效终端消息' })) }
  })
  socket.on('close', () => { if (session.socket === socket) session.socket = null; expire(session) })
}
