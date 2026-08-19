import { defineConfig } from '@playwright/test'

/**
 * e2e 前置:server 起在 3477 并服务构建产物(pnpm build 后 node bin/ccweb.mjs)。
 * 本地:pnpm exec playwright test;CI:workflow_dispatch job。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3477',
  },
  webServer: {
    command: 'node ../server/bin/ccweb.mjs',
    url: 'http://127.0.0.1:3477/healthz',
    reuseExistingServer: true,
    timeout: 20_000,
  },
})
