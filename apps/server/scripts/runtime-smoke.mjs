import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const sdkEntry = import.meta.resolve('@anthropic-ai/claude-agent-sdk')
const require = createRequire(sdkEntry)
const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
const root = dirname(require.resolve(`${nativePackage}/package.json`))
const result = spawnSync(join(root, process.platform === 'win32' ? 'claude.exe' : 'claude'), ['--version'], { encoding:'utf8', timeout:15000, windowsHide:true })
if(result.status !== 0 || !result.stdout.includes('Claude Code')) throw new Error('Bundled Claude Code could not start')
console.log(result.stdout.trim())
