import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export function bundledBinary(): string {
  const require = createRequire(import.meta.url)
  const sdkRequire = createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'))
  return join(dirname(sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')
}
let verifiedFingerprint = ''
const sdkProcesses = new Set<number>()
export function trackSdkProcess(pid: number): () => void {
  sdkProcesses.add(pid)
  return () => { sdkProcesses.delete(pid) }
}
export function assertVerifiedRuntime(): void {
  const file = bundledBinary(), stat = statSync(file), fingerprint = `${file}:${stat.size}:${stat.mtimeMs}`
  if (fingerprint === verifiedFingerprint) return
  const expected = JSON.parse(readFileSync(new URL('../runtime-baseline.json', import.meta.url), 'utf8')) as { cli: string; sdk: string }
  const result = spawnSync(file, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  if (result.status !== 0 || result.stdout.trim() !== `${expected.cli} (Claude Code)`) throw new Error(`随包运行时版本与已验证基线 ${expected.cli} 不符；请恢复精确 SDK 安装并重启，不会回退到全局 CLI`)
  verifiedFingerprint = fingerprint
}

/** A TUI may detach or resume outside its original cwd. Never race that daemon's transcript writer. */
export function assertNoNativeBackground(env: Record<string, string | undefined>): void {
  const result = spawnSync(bundledBinary(), ['agents', '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 8000 })
  if (result.status !== 0) throw new Error('无法核对原生后台会话归属。请在 ccweb 原生终端检查后台任务后再恢复 GUI；不会冒险并发写会话。')
  let sessions: unknown
  try { sessions = JSON.parse(result.stdout) } catch { throw new Error('原生后台状态格式不可识别；未启动 GUI 写入，请在 ccweb 原生终端诊断。') }
  if (!Array.isArray(sessions)) throw new Error('原生后台状态格式不可识别；未启动 GUI 写入，请在 ccweb 原生终端诊断。')
  if (sessions.some(session => !session || typeof session.pid !== 'number' || !sdkProcesses.has(session.pid))) throw new Error('存在未由 ccweb 持有的原生进程，GUI 暂不启动以避免并发写入。请在 ccweb 原生终端检查或停止对应任务后再恢复。')
}
