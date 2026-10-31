import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const baseline = JSON.parse(readFileSync(new URL('../runtime-baseline.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
if (manifest.dependencies['@anthropic-ai/claude-agent-sdk'] !== baseline.sdk) throw new Error('Update the verified runtime baseline and capability matrix when upgrading SDK')
const sdkEntry = import.meta.resolve('@anthropic-ai/claude-agent-sdk')
const require = createRequire(sdkEntry)
const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
const root = dirname(require.resolve(`${nativePackage}/package.json`))
const result = spawnSync(join(root, process.platform === 'win32' ? 'claude.exe' : 'claude'), ['--version'], { encoding:'utf8', timeout:15000, windowsHide:true })
if(result.status !== 0 || !result.stdout.includes(`${baseline.cli} (Claude Code)`)) throw new Error('Bundled Claude Code does not match the verified baseline')
console.log(result.stdout.trim())
