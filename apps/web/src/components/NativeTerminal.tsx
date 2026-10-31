import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useStore } from '../store'

const actions = [['interactive', '原生交互会话'], ['help', 'CLI 帮助'], ['auth', '认证状态'], ['login', '原生登录'], ['doctor', '安装与配置诊断'], ['mcp', 'MCP 清单'], ['plugins', '插件清单'], ['agents', '后台任务清单'], ['custom', '高级 CLI 参数 / 脚本输入']]
export default function NativeTerminal({ onClose }: { onClose: () => void }) {
  const workspace = useStore(s => s.settings?.workspace ?? '')
  const host = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal>()
  const socket = useRef<WebSocket>()
  const [args, setArgs] = useState('["--help"]')
  const [stdin, setStdin] = useState('')
  const [action, setAction] = useState('interactive')
  const [status, setStatus] = useState('尚未启动')
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [retry, setRetry] = useState(0)
  const storageKey = `ccweb.native:${workspace}`
  useEffect(() => {
    const term = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: 'Consolas, monospace', scrollback: 5000, allowProposedApi: false, theme: { background: '#1c1e1b', foreground: '#eeece5', cursor: '#cb8c69' } })
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current!); terminal.current = term
    let ws: WebSocket | undefined, reconnect: ReturnType<typeof setTimeout> | undefined, disposed = false, last = 0
    const sendSize = () => { if (host.current?.clientWidth) { fit.fit(); if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows })) } }
    const resize = new ResizeObserver(sendSize); resize.observe(host.current!)
    const input = term.onData(data => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'input', data })) })
    const connect = () => {
      const saved = sessionStorage.getItem(storageKey)
      if (!saved || disposed) return
      let capability: { id: string; token: string }
      try { capability = JSON.parse(saved) } catch { sessionStorage.removeItem(storageKey); return }
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/native`); socket.current = ws
      ws.onopen = () => ws?.send(JSON.stringify({ ...capability, after: last }))
      ws.onmessage = event => {
        const frame = JSON.parse(event.data)
        if (frame.t === 'ready') { setActive(true); setStatus(`原生进程 · ${frame.workspace}`); if (frame.replayTruncated) term.writeln('\r\n[较早输出已超出恢复缓冲区]\r\n'); sendSize(); term.focus() }
        if (frame.t === 'data' && frame.n > last) { last = frame.n; term.write(frame.data) }
        if (frame.t === 'exit') { setActive(false); setStatus(`进程已退出 · 退出码 ${frame.code}`) }
        if (frame.t === 'error') setStatus(frame.message)
      }
      ws.onclose = event => {
        if (disposed) return
        if (event.code === 1008) { setActive(false); setStatus('进程已过期或正被另一连接控制；可重新启动'); sessionStorage.removeItem(storageKey); return }
        setStatus('连接断开，正在恢复原生进程…'); reconnect = setTimeout(connect, 1500)
      }
      ws.onerror = () => setStatus('终端连接失败，正在等待恢复')
    }
    connect(); sendSize()
    return () => { disposed = true; clearTimeout(reconnect); resize.disconnect(); input.dispose(); ws?.close(); term.dispose(); terminal.current = undefined }
  }, [storageKey, retry])
  async function start() {
    setStarting(true)
    try {
      const response = await fetch('/api/native/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace, action, ...(action === 'custom' ? { args: JSON.parse(args), stdin } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      sessionStorage.setItem(storageKey, JSON.stringify(result)); setRetry(value => value + 1)
    } catch (error) { setStatus(String(error)) } finally { setStarting(false) }
  }
  function stop() { socket.current?.send(JSON.stringify({ t: 'close' })); sessionStorage.removeItem(storageKey); setActive(false); setStatus('已结束原生进程'); socket.current?.close() }
  return <section className="native-panel" aria-label="原生终端">
    <header><div><h2>Claude Code 原生终端</h2><p>SDK 随包运行时 · 独立会话 · 与本服务 GUI 运行互斥</p></div><button onClick={onClose}>返回对话</button></header>
    <div className="native-toolbar"><select aria-label="原生操作" disabled={active || starting} value={action} onChange={e => setAction(e.target.value)}>{actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button disabled={active || starting} onClick={() => void start()}>{starting ? '启动中…' : '启动原生操作'}</button><button disabled={!active} onClick={() => socket.current?.send(JSON.stringify({ t: 'input', data: '\u0003' }))}>Ctrl+C</button><button onClick={stop}>结束进程</button></div>
    {action === 'custom' && <details className="native-advanced" open><summary>高级原生调用</summary><label>参数数组（JSON，无 shell 插值）<input aria-label="CLI 参数数组" disabled={active} value={args} onChange={e => setArgs(e.target.value)} /></label><label>可选 stdin 文本<textarea aria-label="CLI stdin" rows={3} disabled={active} value={stdin} onChange={e => setStdin(e.target.value)} /></label><p>参数直接传给固定随包二进制。可使用 --print、--resume 等已核对参数。填写文本时使用真实 stdin 管道并关闭输入；留空时使用 ConPTY 交互。SDK 与原生服务整体互斥，结束后再恢复 GUI。</p></details>}
    <p role="status">{status}</p><div className="native-screen" ref={host} />
    <p className="native-help">支持原生 / 命令、中文输入、粘贴及快捷键。返回对话保留进程；刷新后用本标签页令牌恢复，断开 30 分钟后回收。服务重启后的进程不冒充 SDK 快照。登录与 OAuth 由你亲自授权；不要在原生维护命令中升级随包二进制。</p>
  </section>
}
