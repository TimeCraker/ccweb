import { readFileSync } from 'node:fs'
import { spawn } from 'node-pty'
import { bundledBinary } from '../dist/native-terminal.js'
const baseline = JSON.parse(readFileSync(new URL('../runtime-baseline.json', import.meta.url), 'utf8'))
const child = spawn(bundledBinary(), ['--version'], { cols: 80, rows: 24, env: process.env })
let output = ''
const timeout = setTimeout(() => { child.kill(); console.error('PTY version timeout'); process.exit(1) }, 15000)
child.onData(data => { output += data })
child.onExit(({ exitCode }) => {
  clearTimeout(timeout)
  const passed = exitCode === 0 && output.includes(`${baseline.cli} (Claude Code)`)
  console.log(JSON.stringify({ pty: passed, platform: process.platform, exitCode }))
  process.exit(passed ? 0 : 1)
})
