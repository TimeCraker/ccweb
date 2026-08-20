/**
 * 构建后处理:web 产物复制进 server 包 public/,并给入口补 shebang。
 * 跨平台(纯 node fs,不依赖 shell cp)。
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const serverRoot = join(here, '..')
const webDist = join(serverRoot, '..', 'web', 'dist')
const target = join(serverRoot, 'public')

if (!existsSync(webDist)) {
  console.error('[copy-web] apps/web/dist 不存在 — 先 pnpm --filter @ccweb/web build')
  process.exit(1)
}
// 先清空再复制,避免旧 hash 产物累积撑大 npm 包
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(webDist, target, { recursive: true })

// dist/index.js 补 shebang(bin 直跑场景;Windows 下 npm shim 不需要但无害)
const entry = join(serverRoot, 'dist', 'index.js')
if (existsSync(entry)) {
  const src = readFileSync(entry, 'utf8')
  if (!src.startsWith('#!')) {
    writeFileSync(entry, `#!/usr/bin/env node\n${src}`)
  }
}
console.log('[copy-web] public/ ready')
