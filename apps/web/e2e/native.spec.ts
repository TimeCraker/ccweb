import { test, expect } from '@playwright/test'
import { openNativeTerminal } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ccweb.locale', 'zh'))
})

test('real bundled CLI uses ConPTY in the browser and replays after refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible()
  await openNativeTerminal(page)
  await page.getByLabel('原生操作').selectOption('help')
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.getByRole('status').filter({ hasText: '进程已退出' })).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.xterm-screen')).toContainText('Configure and manage MCP servers')
  await page.reload()
  await openNativeTerminal(page)
  await expect(page.locator('.xterm-screen')).toContainText('Configure and manage MCP servers')
  await page.screenshot({ path: '../../docs/screenshots/native-help.png' })
  await page.getByRole('button', { name: '结束进程' }).click()
})

test('native endpoint rejects foreign origins, unknown operations and other capability tokens', async ({ page, request }) => {
  const foreign = await request.post('/api/native/start', { headers: { Origin: 'https://foreign.example' }, data: { action: 'help' } })
  expect(foreign.status()).toBe(403)
  await page.goto('/')
  const status = await page.evaluate(async () => (await fetch('/api/native/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'shell' }) })).status)
  expect(status).toBe(400)
  const rejected = await page.evaluate(() => new Promise<number>(resolve => {
    const ws = new WebSocket(`ws://${location.host}/native`)
    ws.onopen = () => ws.send(JSON.stringify({ id: 'unknown', token: 'invalid' }))
    ws.onclose = event => resolve(event.code)
  }))
  expect(rejected).toBe(1008)
})

test('advanced arguments and real stdin pipes stay inside the locked runtime', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible()
  await openNativeTerminal(page)
  await page.getByLabel('原生操作').selectOption('custom')
  await page.getByLabel('CLI 参数数组').fill('["--version"]')
  await page.getByLabel('CLI stdin').fill('中文管道测试')
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.locator('.xterm-screen')).toContainText('2.1.314 (Claude Code)')
  await expect(page.getByRole('status').filter({ hasText: '退出码 0' })).toBeVisible()
  await page.getByRole('button', { name: '结束进程' }).click()
  await page.getByLabel('CLI 参数数组').fill('["update"]')
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.getByRole('status').filter({ hasText: '精确 SDK 依赖升级' })).toBeVisible()
})

test('independent CLI maintenance uses a private copy and installation requires confirmation', async ({ page, request }) => {
  const rejected = await request.post('/api/native/start', {
    headers: { Origin: new URL(test.info().project.use.baseURL!).origin },
    data: { action: 'maintenance', args: ['install', '2.1.314'] },
  })
  expect(rejected.status()).toBe(400)
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible()
  await openNativeTerminal(page)
  await page.getByLabel('原生操作').selectOption('maintenanceHelp')
  await page.getByRole('button', { name: '启动原生操作' }).click()
  await expect(page.locator('.xterm-screen')).toContainText('Usage: claude install', { timeout: 20000 })
  await expect(page.getByRole('status').filter({ hasText: '退出码 0' })).toBeVisible()
  await page.getByRole('button', { name: '结束进程' }).click()
})

test('real native TUI accepts keys, resize and cancellation without model calls', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: '任务输入' })).toBeVisible()
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('tab', { name: '工作方式与权限', exact: true }).click()
  await page.getByLabel('文件配置来源').selectOption('none')
  await expect(page.getByRole('status').filter({ hasText: /设置已提交|默认配置已保存/ })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭设置' }).click()
  await openNativeTerminal(page)
  await page.getByRole('button', { name: '启动原生操作' }).click()
  // 真实 TUI 是否首屏弹出主题选择取决于本机网络与首次运行状态;这里只要求 TUI 真正启动,
  // 不把能否访问外部服务当成本次 UI 回归的前置条件。
  await expect(page.locator('.xterm-screen')).toContainText(/Welcome to Claude Code|Claude Code/, { timeout: 20000 })
  await expect(page.locator('.xterm-helper-textarea')).toBeAttached()
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: '../../docs/screenshots/native-tui.png' })
  await page.getByRole('button', { name: '结束进程' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已结束原生进程' })).toBeVisible()
  await page.getByRole('button', { name: '返回对话', exact: true }).click()
  await page.keyboard.press('Control+,')
  await dialog.getByRole('tab', { name: '工作方式与权限', exact: true }).click()
  await page.getByLabel('文件配置来源').selectOption('full')
  await expect(page.getByRole('status').filter({ hasText: /设置已提交|默认配置已保存/ })).toBeVisible()
})
