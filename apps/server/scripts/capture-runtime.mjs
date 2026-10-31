import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.resolve('@anthropic-ai/claude-agent-sdk'))
const binary = join(dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')
const commands = [['--version'], ['--help'], ['auth', '--help'], ['auth', 'login', '--help'], ['mcp', '--help'], ['mcp', 'login', '--help'], ['plugin', '--help'], ['agents', '--help'], ['attach', '--help'], ['doctor', '--help'], ['install', '--help'], ['update', '--help']]
const evidence = { capturedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, sdk: '0.3.314', samples: commands.map(args => {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  return { args, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }
}) }
const target = resolve(process.argv[2] ?? '../../docs/audit/2026-10-31/runtime-capabilities.json')
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify({ target, version: evidence.samples[0].stdout.trim(), samples: evidence.samples.length, failed: evidence.samples.filter(s => s.status !== 0).map(s => s.args) }))
