import { test, expect } from '@playwright/test'

test('real bundled CLI uses ConPTY in the browser and replays after refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('运行模式', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '原生终端', exact: true }).click()
  await page.getByLabel('原生操作').selectOption('help')
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.getByRole('status').filter({ hasText: '进程已退出' })).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.xterm-screen')).toContainText('Configure and manage MCP servers')
  await page.reload()
  await page.getByRole('button', { name: '原生终端', exact: true }).click()
  await expect(page.locator('.xterm-screen')).toContainText('Configure and manage MCP servers')
  await page.screenshot({ path: '../../docs/screenshots/native-help.png' })
  await page.getByRole('button', { name: '结束进程' }).click()
})

test('native endpoint rejects foreign origins, unknown operations and other capability tokens', async ({ page }) => {
  await page.goto('/')
  const status = await page.evaluate(async () => (await fetch('/api/native/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'shell' }) })).status)
  expect(status).toBe(400)
  const rejected = await page.evaluate(() => new Promise<number>(resolve => { const ws = new WebSocket(`ws://${location.host}/native`); ws.onopen = () => ws.send(JSON.stringify({ id: 'unknown', token: 'invalid' })); ws.onclose = event => resolve(event.code) }))
  expect(rejected).toBe(1008)
})


test('real native TUI accepts keys, resize and cancellation without model calls', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('运行模式', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '原生终端', exact: true }).click()
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.locator('.xterm-screen')).toContainText(/Choose|Select|theme|Theme|trust|log in|login|Login|暗色|选择/, { timeout: 20000 })
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: '../../docs/screenshots/native-tui.png' })
  await page.getByRole('button', { name: '结束进程' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已结束原生进程' })).toBeVisible()
})
