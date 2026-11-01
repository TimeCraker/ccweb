import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

test.use({ baseURL: 'http://127.0.0.1:3495' })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ccweb.locale', 'zh')
    localStorage.setItem('ccweb.theme', 'light')
  })
})

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
}

async function openConnectionForm(page: Page) {
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '模型与连接', exact: true }).click()
  await dialog.getByRole('button', { name: '添加连接' }).click()
  return dialog
}

test('IA05: menu form supports Tab/Shift+Tab/Home/End and closes only on leave', async ({ page }) => {
  await ready(page)
  const trigger = page.getByRole('button', { name: '模型', exact: true })
  await trigger.click()
  const menu = page.getByRole('menu', { name: '模型', exact: true })
  const custom = menu.getByLabel('自定义模型 ID')
  await custom.fill('custom-abc')
  await custom.press('Home')
  expect(await custom.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(0)
  await custom.press('End')
  expect(await custom.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe('custom-abc'.length)
  await custom.press('Tab')
  await expect(menu).toBeVisible()
  const apply = menu.getByRole('button', { name: '应用', exact: true })
  await expect(apply).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(custom).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('IA03: changing the key invalidates a probe, including a late old response', async ({ page }) => {
  let count = 0
  await page.route('**/api/connections/test', async (route) => {
    count += 1
    const body = JSON.parse(route.request().postData() ?? '{}') as { apiKey?: string }
    if (body.apiKey === 'sk-first') await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        category: 'ok',
        status: 200,
        model: 'audit-model',
        elapsedMs: 20,
        requestUrl: 'http://127.0.0.1:9/anthropic/v1/messages',
        message: '连接成功。',
      }),
    })
  })
  await ready(page)
  const dialog = await openConnectionForm(page)
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/anthropic')
  await dialog.getByLabel('API Key').fill('sk-first')
  await dialog.getByRole('button', { name: '测试连接' }).click()
  await expect(dialog.getByRole('button', { name: '取消测试' })).toBeVisible()
  // 请求进行中改 Key:旧响应到达后必须是“已失效”,不能显示连通成功
  await dialog.getByLabel('API Key').fill('sk-changed')
  await expect(dialog.getByText('旧测试结果已失效')).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByText('连通成功')).toHaveCount(0)

  // 新测试立即成功;旧请求迟到返回也不能覆盖新结果
  await dialog.getByRole('button', { name: '重试连接测试' }).click()
  await expect(dialog.getByText('连通成功')).toBeVisible()
  await page.waitForTimeout(1_000)
  await expect(dialog.getByText('连通成功')).toBeVisible()
  await expect(dialog.getByText('旧测试结果已失效')).toHaveCount(0)
  expect(count).toBeGreaterThanOrEqual(2)
})

test('IA04: connection search matches connections and keeps groups', async ({ page }) => {
  await ready(page)
  const dialog = await openConnectionForm(page)
  await dialog.getByLabel('连接名称').fill('AuditConnection')
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/anthropic')
  await dialog.getByLabel('API Key').fill('sk-audit')
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await expect(dialog.getByText(/已保存「AuditConnection」/)).toBeVisible()
  await page.keyboard.press('Escape')

  const trigger = page.getByRole('button', { name: '模型', exact: true })
  await trigger.click()
  const menu = page.getByRole('menu', { name: '模型', exact: true })
  const search = menu.getByRole('textbox', { name: '模型', exact: true })
  await search.fill('AuditConnection')
  await expect(menu.getByText('已配置连接')).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: /AuditConnection/ })).toBeVisible()
  await search.fill('')
  await expect(menu.getByRole('menuitemradio', { name: /AuditConnection/ })).toBeVisible()
})

test('IA02: auth mode is explicit and reflected in the connection list', async ({ page }) => {
  await ready(page)
  let dialog = await openConnectionForm(page)
  await dialog.getByLabel('连接名称').fill('NoAuthGateway')
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/gateway')
  await dialog.getByRole('radio', { name: '无认证' }).click()
  await expect(dialog.getByLabel('API Key')).toHaveCount(0)
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await expect(dialog.getByText(/已保存「NoAuthGateway」/)).toBeVisible()
  await expect(dialog.getByText('无认证（仅适合本机网关）')).toBeVisible()
  await page.keyboard.press('Escape')

  dialog = await openConnectionForm(page)
  await dialog.getByLabel('连接名称').fill('InheritGateway')
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/inherit')
  await dialog.getByRole('radio', { name: '继承本机凭证' }).click()
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await expect(dialog.getByText('继承本机环境凭证')).toBeVisible()
})

test('IA06: current-session model selection is separate from the default', async ({ page }) => {
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('IA06 session model')
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：IA06 session model', { exact: true })).toBeVisible()

  const chip = page.locator('.model-chip')
  const openMenu = async () => {
    await chip.click()
    return page.getByRole('menu', { name: '模型', exact: true })
  }
  let menu = await openMenu()
  await menu.getByLabel('自定义模型 ID').fill('audit-session-model')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  await expect(chip).toContainText('audit-session-model')

  menu = await openMenu()
  await expect(menu.getByRole('menuitemradio', { name: /^audit-session-model/ })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('menuitemradio', { name: /使用连接默认/ })).toHaveAttribute('aria-checked', 'false')
  await menu.getByRole('menuitemradio', { name: /使用连接默认/ }).click()

  menu = await openMenu()
  await expect(menu.getByRole('menuitemradio', { name: /使用连接默认/ })).toHaveAttribute('aria-checked', 'true')
  await menu.getByLabel('自定义模型 ID').fill('audit-session-model')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  menu = await openMenu()
  await menu.getByRole('menuitem', { name: /保存为默认模型/ }).click()

  menu = await openMenu()
  await expect(menu.getByRole('menuitem', { name: /保存为默认模型/ })).toBeDisabled()
  await menu.getByLabel('自定义模型 ID').fill('audit-reject-model')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  await page.waitForTimeout(600)
  await expect(chip).not.toContainText('audit-reject-model')
})

test('P5: an external edit while drafting opens a conflict and preserves the draft', async ({ page }) => {
  await ready(page)
  const runtime = (await (await page.request.get('/api/runtime')).json()) as { configDirectory: string }
  const name = `e2e-conflict-${Date.now().toString(36)}`
  const directory = join(runtime.configDirectory, 'skills', name)
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'SKILL.md')
  writeFileSync(file, `---\nname: ${name}\ndescription: conflict fixture\n---\n# Original\n`)
  try {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '工作方式', exact: true })).toBeEnabled()
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('tab', { name: '技能', exact: true }).click()
    await dialog.getByText(name, { exact: true }).click()
    await expect(page.locator('.editor-head h4')).toContainText(name)
    const body = page.getByLabel('正文', { exact: true })
    await body.fill('# Local draft\n')
    writeFileSync(file, `---\nname: ${name}\ndescription: external edit\n---\n# External\n`)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '确认保存', exact: true }).click()
    await dialog.getByText('磁盘版本与当前草稿不同（草稿已保留）').waitFor({ timeout: 5_000 })
    await expect(body).toHaveValue('# Local draft\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('P5: many file changes keep the drawer readable and scrollable', async ({ page }) => {
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('MANY_CHANGES')
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：MANY_CHANGES', { exact: true })).toBeVisible({ timeout: 20_000 })
  const strip = page.locator('.change-strip').filter({ hasText: '本次改动' })
  await expect(strip).toContainText('120 个文件')
  await strip.getByRole('button', { name: '查看', exact: true }).click()
  const drawer = page.getByRole('complementary', { name: '本次改动' })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.change-file')).toHaveCount(120)
  const scroll = await drawer.locator('.drawer-body').evaluate((el) => ({ top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight }))
  expect(scroll.total).toBeGreaterThan(scroll.height)
  await drawer.locator('.drawer-body').evaluate((el) => { el.scrollTop = el.scrollHeight })
  await expect(drawer.getByText('fixture/file-119.ts', { exact: false })).toBeVisible()
})

test('P5: attachment draft survives a websocket reconnect', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.WebSocket
    ;(window as unknown as { __ccwebSockets: WebSocket[] }).__ccwebSockets = []
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        ;(window as unknown as { __ccwebSockets: WebSocket[] }).__ccwebSockets.push(this)
      }
    } as typeof WebSocket
  })
  await ready(page)
  await page.locator('input[type=file]').setInputFiles({
    name: 'offline.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6g9sAAAAASUVORK5CYII=', 'base64'),
  })
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('offline attachment draft')
  await page.evaluate(() => {
    for (const socket of (window as unknown as { __ccwebSockets: WebSocket[] }).__ccwebSockets) socket.close()
  })
  await expect(page.locator('.sidebar-footer-row')).toContainText(/重连|断开/, { timeout: 5_000 })
  await expect(page.locator('.composer img')).toHaveCount(1)
  await expect(box).toHaveValue('offline attachment draft')
  await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.composer img')).toHaveCount(1)
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：offline attachment draft', { exact: true })).toBeVisible()
})

test('effort levels follow the runtime-declared model capability', async ({ page }) => {
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('effort capability probe')
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：effort capability probe', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('tab', { name: '模型与连接', exact: true }).click()
  await dialog.getByRole('button', { name: '发现可用模型' }).click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')

  const chip = page.locator('.model-chip')
  await chip.click()
  let menu = page.getByRole('menu', { name: '模型', exact: true })
  await menu.getByLabel('自定义模型 ID').fill('fixture-discovered')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  await expect(chip).toContainText('fixture-discovered')

  menu = await (async () => { await chip.click(); return page.getByRole('menu', { name: '模型', exact: true }) })()
  const pills = menu.locator('.effort-pill')
  await expect(pills).toHaveText(['默认', '低', '高'])
  await menu.getByRole('menuitem', { name: /保存为默认模型/ }).click()
  await page.keyboard.press('Escape')

  // 设置页的“新会话默认思考力度”也只展示同一能力清单
  await page.keyboard.press('Control+,')
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('tab', { name: '工作方式与权限', exact: true }).click()
  await expect(settings.locator('.segmented[aria-label="默认思考力度"] button')).toHaveText(['默认', '低', '高'])
})
test('model display: current connection model survives a new-session default change', async ({ page }) => {
  await ready(page)
  const dialog = await openConnectionForm(page)
  await dialog.getByLabel('连接名称').fill('ConnectionA')
  await dialog.getByLabel('模型 ID').fill('connection-model-a')
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/anthropic')
  await dialog.getByLabel('API Key').fill('sk-audit-a')
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await dialog.getByText(/已保存「ConnectionA」/).waitFor()
  await page.keyboard.press('Escape')

  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('model display session A')
  await box.press('Enter')
  await page.getByText('【E2E】模拟完成：model display session A', { exact: true }).waitFor()
  const chip = page.locator('.model-chip')
  await expect(chip).toContainText('connection-model-a')

  // 新建会话后把 B 保存为新会话默认,再回到原来的会话 A
  await page.getByRole('button', { name: '新建会话' }).click()
  await chip.click()
  const menu = page.getByRole('menu', { name: '模型', exact: true })
  await menu.getByLabel('自定义模型 ID').fill('default-model-b')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  await expect(chip).toContainText('default-model-b')
  await page.getByRole('button', { name: /model display session A/ }).first().click()
  await page.waitForTimeout(500)
  await expect(chip).toContainText('connection-model-a')
  await expect(chip).not.toContainText('default-model-b')
})

test('model display: "use connection default" can be saved as the new-session default', async ({ page }) => {
  await ready(page)
  const dialog = await openConnectionForm(page)
  await dialog.getByLabel('连接名称').fill('ConnectionC')
  await dialog.getByLabel('模型 ID').fill('connection-model-c')
  await dialog.getByLabel('接口地址（Base URL）').fill('http://127.0.0.1:9/anthropic')
  await dialog.getByLabel('API Key').fill('sk-audit-c')
  await dialog.getByRole('button', { name: '保存并使用' }).click()
  await dialog.getByText(/已保存「ConnectionC」/).waitFor()
  await page.keyboard.press('Escape')

  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('model display session C')
  await box.press('Enter')
  await page.getByText('【E2E】模拟完成：model display session C', { exact: true }).waitFor()
  const chip = page.locator('.model-chip')
  const openMenu = async () => {
    await chip.click()
    return page.getByRole('menu', { name: '模型', exact: true })
  }
  let menu = await openMenu()
  await menu.getByLabel('自定义模型 ID').fill('default-model-d')
  await menu.getByRole('button', { name: '应用', exact: true }).click()
  menu = await openMenu()
  await menu.getByRole('menuitem', { name: /保存为默认模型/ }).click()

  menu = await openMenu()
  await menu.getByRole('menuitemradio', { name: /使用连接默认/ }).click()
  menu = await openMenu()
  const saveDefault = menu.getByRole('menuitem', { name: /保存为默认模型/ })
  await expect(saveDefault).toBeEnabled()
  await saveDefault.click()
  menu = await openMenu()
  await expect(menu.getByRole('menuitem', { name: /保存为默认模型/ })).toBeDisabled()
  await expect(menu.getByRole('menuitemradio', { name: /使用连接默认/ })).toHaveAttribute('aria-checked', 'true')
})

test('model display: shows the provider model name instead of the runtime alias', async ({ page }) => {
  const existing = (await (await page.request.get('/api/connections')).json()) as Array<{ key: string }>
  for (const connection of existing) await page.request.post('/api/connections/delete', { data: { key: connection.key } })
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('provider name display')
  await box.press('Enter')
  await page.getByText('【E2E】模拟完成：provider name display', { exact: true }).waitFor()
  const chip = page.locator('.model-chip')
  await expect(chip).toContainText('fixture-provider-model')
  await expect(chip).not.toContainText('fixture-model')
})
