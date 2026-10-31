import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ccweb.locale', 'zh'))
})

test.describe('ccweb shell', () => {
  test('boots and renders the empty state', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/ccweb/)
    await expect(page.getByRole('heading', { name: /今天想完成什么|What do you want to get done/ })).toBeVisible()
  })

  test('composer accepts input and enables sending', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    const box = page.getByRole('textbox', { name: '任务输入' })
    await expect(box).toBeVisible()
    await box.fill('hello')
    await expect(page.getByRole('button', { name: /^(发送|Send)$/ })).toBeEnabled()
  })

  test('Ctrl+K opens the command palette and Esc closes it', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '命令面板' })).toBeHidden()
  })

  test('sidebar shows connection state', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByText('已连接').or(page.getByText('Connected')).or(page.getByText('连接中')),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('workspace picker explains its boundary and closes on outside click', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    await page.locator('.workspace-trigger').click()
    await expect(page.getByRole('menu', { name: /最近项目|Recent projects/ })).toBeVisible()
    await expect(page.getByText(/磁盘目录不会被删除|folder is not deleted/)).toBeVisible()
    await page.locator('.header h1').click()
    await expect(page.getByRole('menu', { name: /最近项目|Recent projects/ })).toBeHidden()
  })

  test('collapsed rail keeps every control separate and reachable', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    await page.getByRole('button', { name: /折叠侧栏|Collapse sidebar/ }).click()
    const rail = page.locator('.sidebar.is-rail')
    await expect(rail).toBeVisible()
    const boxes = await rail.locator('.rail-item').evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect()
        return { label: item.getAttribute('aria-label') ?? '', top: rect.top, bottom: rect.bottom, width: rect.width }
      }),
    )
    expect(boxes.length).toBeGreaterThan(2)
    for (const [index, box] of boxes.entries()) {
      expect(box.label).not.toBe('')
      expect(box.width).toBeGreaterThanOrEqual(32)
      if (index > 0) expect(box.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom)
    }
    await page.screenshot({ path: info.outputPath('collapsed-rail.png'), animations: 'disabled' })
    await rail.getByRole('button', { name: /展开侧栏|Expand sidebar/ }).click()
    await expect(page.locator('.sidebar:not(.is-rail)')).toBeVisible()
  })
})

test('settings reads once, stays quiet and reopens without a request loop', async ({ page }) => {
  let reads = 0
  page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
    try {
      if ((JSON.parse(String(payload)) as { t?: string }).t === 'settings.get') reads += 1
    } catch { /* Ignore unrelated non-JSON frames. */ }
  }))
  await page.goto('/')
  await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
  const before = reads
  await page.locator('.sidebar-foot-btn').click()
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await expect.poll(() => reads).toBe(before + 1)
  // 明确的空闲窗口:此前的实现会因 settings 回执触发无休止的读取/渲染循环。
  await page.waitForTimeout(8_000)
  expect(reads).toBe(before + 1)
  await dialog.getByRole('tab', { name: '技能', exact: true }).click()
  expect(reads).toBe(before + 1)
  await dialog.press('Escape')
  await expect(dialog).toBeHidden()
  await page.locator('.sidebar-foot-btn').click()
  await expect.poll(() => reads).toBe(before + 2)
})
