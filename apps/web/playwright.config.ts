import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * e2e 前置:server 起在 3477 并服务构建产物(pnpm build 后 node bin/ccweb.mjs)。
 * 本地:pnpm exec playwright test;CI:workflow_dispatch job。
 */
const testHome = join(tmpdir(), 'ccweb-playwright-profile')
mkdirSync(testHome, { recursive: true })
mkdirSync(join(testHome, 'workspace'), { recursive: true })

export default defineConfig({
  outputDir: '../../.ccweb-test/results',
  workers: 1,
  testDir: './e2e',
  timeout: 30_000,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL: 'http://127.0.0.1:3477',
  },
  webServer: [{
    command: `node "${process.env.CCWEB_E2E_BIN ?? "../server/bin/ccweb.mjs"}"`,
    url: 'http://127.0.0.1:3477/healthz',
    reuseExistingServer: false,
    env: { USERPROFILE: testHome, HOME: testHome, CCWEB_WORKSPACE: join(testHome, 'workspace'), CCWEB_PORT: '3477', CCWEB_HOME: join(testHome, '.ccweb'), CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
    timeout: 20_000,
  }, {
    command: 'node ../server/test/fixture-server.mjs',
    url: 'http://127.0.0.1:3495/healthz',
    reuseExistingServer: false,
    env: { USERPROFILE: testHome, HOME: testHome, CCWEB_WORKSPACE: join(testHome, 'workspace'), CCWEB_PORT: '3495', CCWEB_HOME: join(testHome, '.fixture'), CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
    timeout: 20_000,
  }],
})
