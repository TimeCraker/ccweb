import { expect, test, type Page } from '@playwright/test'
test.use({ baseURL: 'http://127.0.0.1:3495' })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ccweb.locale', 'zh'))
})

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('.sidebar-footer-row')).toContainText(/已连接|Connected/)
  await expect(page.locator('.composer-bar .chip-btn').first()).toBeEnabled()
}

async function send(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: '任务输入', exact: true })
  await box.fill(text)
  await box.press('Enter')
}

async function completed(page: Page, text: string) {
  await expect(page.getByText(`【E2E】模拟完成：${text}`, { exact: true })).toBeVisible()
}

async function setMode(page: Page, label: string) {
  await page.getByRole('button', { name: '工作方式', exact: true }).click()
  await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click()
}

async function openDrawer(page: Page, name: string) {
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
  return page.getByRole('complementary', { name })
}

test('approval survives reload, preserves draft and stays isolated from another client', async ({ page, browser }, info) => {
  await ready(page)
  await send(page, 'APPROVAL reconnect')
  const card = page.locator('.permission-card')
  await expect(card).toBeVisible()
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill('【E2E】保留草稿')
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await ready(otherPage)
  await expect(otherPage.locator('.permission-card')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.permission-card')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toHaveValue('【E2E】保留草稿')
  await expect(page.getByRole('button', { name: '排队发送', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('approval.png') })
  await card.getByRole('button', { name: '允许', exact: true }).click()
  await completed(page, 'APPROVAL reconnect')
  await expect(page.locator('.permission-card')).toHaveCount(0)
  const drawer = await openDrawer(page, '本次改动')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('fixture.txt').first()).toBeVisible()
  await drawer.getByRole('button', { name: '关闭面板' }).click()
  await expect(otherPage.getByText('【E2E】模拟完成：APPROVAL reconnect')).toHaveCount(0)
  await expect(page.locator('.usage')).toContainText('tok/s')
  await other.close()
})

test('plan adoption, question answer and unsupported native mode receipt', async ({ page }) => {
  await ready(page)
  await setMode(page, '计划模式')
  await expect(page.locator('.composer-bar .chip-btn').first()).toContainText('计划模式')
  await send(page, 'PLAN review')
  await page.getByRole('button', { name: '采纳并开始执行', exact: true }).click()
  await completed(page, 'PLAN review')
  await send(page, 'QUESTION choice')
  await page.getByRole('button', { name: '方案 A', exact: true }).click()
  await page.getByRole('button', { name: '提交', exact: true }).click()
  await completed(page, 'QUESTION choice')
  // 运行时拒绝自动模式:回执错误可见,界面保持原值(不回显"已切换")
  await setMode(page, '自动模式')
  await expect(page.getByText(/auto unavailable/)).toBeVisible()
  await expect(page.locator('.composer-bar .chip-btn').first()).not.toContainText('自动模式')
})

test('interrupt holds queue until explicit resume and crash allows a fresh request', async ({ page }) => {
  await ready(page)
  await send(page, 'WAIT primary')
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible()
  await send(page, 'queued secondary')
  await expect(page.getByTitle('queued secondary', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续队列', exact: true })).toBeVisible()
  await expect(page.getByText('【E2E】模拟完成：queued secondary', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '继续队列', exact: true }).click()
  await completed(page, 'queued secondary')
  await expect(page.getByText(/模型请求失败/)).toHaveCount(0)
  await send(page, 'CRASH')
  await expect(page.getByText(/simulated crash/)).toBeVisible()
  await send(page, 'retry explicitly')
  await completed(page, 'retry explicitly')
})

test('synthetic API errors cannot be treated as successful task completion', async ({ page }) => {
  await ready(page)
  await send(page, 'SDK_ERROR')
  await expect(page.getByText(/模型请求失败：rate_limit/)).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
  await send(page, 'explicit recovery')
  await completed(page, 'explicit recovery')
})

test('a project command created in settings is callable from the composer', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '指令', exact: true }).click()
  const name = `e2e:invoke-${Date.now().toString(36)}`
  await dialog.getByRole('button', { name: '新建', exact: true }).click()
  await page.locator('.resource-create').getByLabel('名称').fill(name)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.locator('.editor-head h4')).toContainText(name)
  await page.getByRole('button', { name: '关闭设置' }).click()
  await expect(dialog).toBeHidden()
  await send(page, `/${name} `)
  await completed(page, `/${name}`)
})

test('delayed initial settings preserve typed drafts and block premature sending', async ({ page }) => {
  await page.routeWebSocket('**/ws', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      if (JSON.parse(String(message)).t === 'settings') setTimeout(() => socket.send(message), 900)
      else socket.send(message)
    })
  })
  await page.goto('/')
  const box = page.getByRole('textbox', { name: '任务输入', exact: true })
  await box.fill('【E2E】启动期间草稿')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await expect(box).toHaveValue('【E2E】启动期间草稿')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled({ timeout: 10_000 })
  await box.press('Enter')
  await completed(page, '【E2E】启动期间草稿')
})

test('refresh before SDK initialization reattaches to the accepted run', async ({ page }) => {
  await ready(page)
  await send(page, 'WAIT early reconnect')
  await expect(page.getByRole('log').getByText('WAIT early reconnect', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('log').getByText('WAIT early reconnect', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
})

test('empty plans cannot be adopted, while revision and stop remain available', async ({ page }) => {
  await ready(page)
  await send(page, 'EMPTY_PLAN')
  await expect(page.getByRole('button', { name: '采纳并开始执行', exact: true })).toBeDisabled()
  await expect(page.getByText('尚未收到可审查的计划正文。可以继续修改计划，或直接停止。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续修改计划', exact: true }).click()
  await completed(page, 'EMPTY_PLAN')
})
