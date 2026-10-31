import { expect, test, type Page } from '@playwright/test'

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
  await expect(page.getByRole('button', { name: '工作方式', exact: true })).toBeEnabled()
}

async function send(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill(text)
  await box.press('Enter')
}

test('only one menu layer is open, outside click closes, Esc returns focus', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '工作方式', exact: true }).click()
  await expect(page.getByRole('menu', { name: '工作方式' })).toBeVisible()
  await page.getByRole('button', { name: '模型', exact: true }).click()
  await expect(page.getByRole('menu', { name: '模型' })).toBeVisible()
  await expect(page.getByRole('menu', { name: '工作方式' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: '模型' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '模型', exact: true })).toBeFocused()

  await page.locator('.workspace-trigger').click()
  await expect(page.getByRole('menu', { name: '最近项目' })).toBeVisible()
  await page.locator('.header h1').click()
  await expect(page.getByRole('menu', { name: '最近项目' })).toHaveCount(0)
})

test('menus are keyboard navigable and Chinese IME Enter never sends', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '工作方式', exact: true }).click()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[role=menuitemradio]:focus')).toHaveCount(1)
  await page.keyboard.press('Escape')

  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('中文输入法组合中')
  await box.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
  })
  await expect(box).toHaveValue('中文输入法组合中')
  await expect(page.getByRole('log')).toHaveCount(0)
})

test('usage popover opens on demand, survives inner interaction and returns focus on Esc', async ({ page }) => {
  await ready(page)
  await send(page, 'metrics contract')
  await expect(page.getByText('【E2E】模拟完成：metrics contract', { exact: true })).toBeVisible()
  const usage = page.locator('.usage')
  await expect(usage).toContainText('tok/s')
  await expect(usage).toContainText('上下文')

  const trigger = page.getByRole('button', { name: '用量', exact: true })
  await trigger.click()
  const panel = page.locator('.usage-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('本次对话')
  // 弹层内部的选择/展开不应关闭
  await panel.locator('summary').first().click()
  await expect(panel).toBeVisible()
  await expect(panel.locator('.usage-details').first()).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  // 外点关闭
  await trigger.click()
  await expect(panel).toBeVisible()
  await page.locator('.header h1').click()
  await expect(panel).toHaveCount(0)
})

test('settings modal: categories, backdrop dismissal and unsaved-draft protection', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  for (const tab of ['模型与连接', '工作方式与权限', '技能', '指令', '上下文与规则', 'MCP 与工具', 'Hooks', '通用', '关于与更新']) {
    await expect(dialog.getByRole('tab', { name: tab, exact: true })).toBeVisible()
  }
  await dialog.getByRole('button', { name: '添加连接' }).click()
  await page.getByLabel('连接名称').fill('草稿保护')
  // Esc 触发放弃确认;拒绝后弹窗与草稿都保留
  page.once('dialog', (prompt) => void prompt.dismiss())
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('连接名称')).toHaveValue('草稿保护')
  page.once('dialog', (prompt) => void prompt.accept())
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('connection form validates drafts and marks stale test results', async ({ page }) => {
  await page.route('**/api/connections/test', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        category: 'ok',
        status: 200,
        model: 'glm-5.3',
        elapsedMs: 220,
        requestUrl: 'https://api.example.com/anthropic/v1/messages',
        message: '连接成功。测试只验证文本接口可达，工具与图片能力仍需在任务中确认。',
      }),
    })
  })
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('button', { name: '添加连接' }).click()
  await page.getByLabel('接口地址（Base URL）').fill('https://api.example.com/anthropic')
  await page.getByLabel('API Key').fill('sk-contract-test')
  await page.getByLabel('模型 ID').fill('glm-5.3')
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(dialog.getByText('连通成功')).toBeVisible()
  await expect(dialog.getByText(/anthropic\/v1\/messages/)).toBeVisible()
  await page.getByLabel('模型 ID').fill('glm-5.4')
  await expect(dialog.getByText('表单已修改，以上结果不再代表当前草稿。')).toBeVisible()

  await page.getByLabel('接口地址（Base URL）').fill('https://api.example.com/v1/chat/completions')
  await expect(dialog.getByText('此接口格式当前不兼容。')).toBeVisible()
  await page.getByLabel('接口地址（Base URL）').fill('not-a-url')
  await expect(dialog.getByText('请输入完整地址，例如 https://api.example.com/anthropic')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存并使用' })).toBeDisabled()
})

test('drawers keep the conversation mounted and composer reachable', async ({ page }) => {
  await ready(page)
  await send(page, 'VISUAL drawer contract')
  await expect(page.getByText('【E2E】模拟完成：VISUAL drawer contract', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: /运行详情/ }).click()
  const drawer = page.getByRole('complementary', { name: '运行详情' })
  await expect(drawer).toBeVisible()
  await expect(page.getByText('【E2E】模拟完成：VISUAL drawer contract', { exact: true })).toBeVisible()
  await expect(page.locator('.composer')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await drawer.getByRole('tab', { name: '调用轨迹', exact: true }).click()
  await expect(drawer.getByText('Read', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '关闭面板' }).click()
  await expect(drawer).toHaveCount(0)
})

test('composer draft survives settings, sidebar collapse and session list toggles', async ({ page }) => {
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('切换前草稿')
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(box).toHaveValue('切换前草稿')
  await page.getByRole('button', { name: /折叠侧栏/ }).click()
  await expect(box).toHaveValue('切换前草稿')
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.sidebar.is-rail').getByRole('button', { name: /展开侧栏/ }).click()
  await expect(box).toHaveValue('切换前草稿')
})

test('session model changes stay separate from the saved default', async ({ page }) => {
  await ready(page)
  await send(page, 'scope session model')
  await expect(page.getByText('【E2E】模拟完成：scope session model', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '模型', exact: true }).click()
  const sessionModel = `fixture-session-${Date.now().toString(36)}`
  await page.getByLabel('自定义模型 ID').fill(sessionModel)
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await expect(page.locator('.model-chip')).toContainText(sessionModel)

  // 当前会话已改,但默认值未变:保存为默认仍可用
  await page.getByRole('button', { name: '模型', exact: true }).click()
  const saveDefault = page.getByRole('menuitem', { name: /保存为默认模型/ })
  await expect(saveDefault).toBeEnabled()
  await saveDefault.click()
  await page.waitForTimeout(500)

  // 保存默认后,再次打开应显示“已是默认”(按钮禁用)
  await page.getByRole('button', { name: '模型', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /保存为默认模型/ })).toBeDisabled()
})

test('an OpenAI-style endpoint is clearly rejected before saving', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('button', { name: '添加连接' }).click()
  await page.getByLabel('接口地址（Base URL）').fill('https://api.example.com/v1/chat/completions')
  await expect(dialog.getByText('此接口格式当前不兼容。')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存并使用' })).toBeDisabled()
  await page.getByLabel('接口地址（Base URL）').fill('https://api.example.com/anthropic')
  await expect(dialog.getByRole('button', { name: '保存并使用' })).toBeEnabled()
})

test('connection test can be cancelled without saving', async ({ page }) => {
  await page.route('**/api/connections/test', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        category: 'ok',
        status: 200,
        model: 'glm-5.3',
        elapsedMs: 180,
        requestUrl: 'https://api.example.com/anthropic/v1/messages',
        message: '连接成功。',
      }),
    })
  })
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('button', { name: '添加连接' }).click()
  await page.getByLabel('接口地址（Base URL）').fill('https://api.example.com/anthropic')
  await page.getByLabel('API Key').fill('sk-cancel-me')
  await dialog.getByRole('button', { name: '测试连接' }).click()
  await expect(dialog.getByRole('button', { name: '取消测试' })).toBeVisible()
  await dialog.getByRole('button', { name: '取消测试' }).click()
  await expect(dialog.getByText('已取消测试，没有保存任何更改。')).toBeVisible()
  await expect(dialog.getByText('连通成功')).toHaveCount(0)
})
test('deleted sessions can be restored from settings without rerunning work', async ({ page }) => {
  let deleted = [
    { id: '11111111-1111-4111-8111-111111111111', title: '已删除的回归会话', deletedAt: Date.now() - 60_000, projectDir: '/tmp/project', bytes: 2048 },
  ]
  await page.route('**/api/sessions/deleted', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleted) })
  })
  await page.route('**/api/sessions/restore', async (route) => {
    const id = JSON.parse(route.request().postData() ?? '{}').id as string
    deleted = deleted.filter((item) => item.id !== id)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sessionId: id }) })
  })
  await ready(page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('tab', { name: '通用', exact: true }).click()
  await expect(dialog.getByText('已删除的回归会话')).toBeVisible()
  await dialog.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(dialog.getByText(/已恢复「已删除的回归会话」/)).toBeVisible()
  await expect(dialog.getByText('没有可恢复的会话。')).toBeVisible()
})

test('sending the exact same content twice asks for confirmation', async ({ page }) => {
  await ready(page)
  const box = page.getByRole('textbox', { name: '任务输入' })
  await box.fill('duplicate send check')
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：duplicate send check', { exact: true })).toBeVisible()
  await box.fill('duplicate send check')
  page.once('dialog', (prompt) => void prompt.dismiss())
  await box.press('Enter')
  await page.waitForTimeout(400)
  await expect(page.getByText('【E2E】模拟完成：duplicate send check', { exact: true })).toHaveCount(1)
  await box.fill('duplicate send check')
  page.once('dialog', (prompt) => void prompt.accept())
  await box.press('Enter')
  await expect(page.getByText('【E2E】模拟完成：duplicate send check', { exact: true })).toHaveCount(2)
})
