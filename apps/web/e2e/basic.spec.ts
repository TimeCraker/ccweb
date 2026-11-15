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
    const box = page.getByRole('textbox', { name: /任务输入|Task input/ })
    await expect(box).toBeFocused()
    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: '命令面板' })
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole('textbox', { name: /输入命令或搜索会话|Type a command/ })
    await input.focus()
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(dialog).toBeHidden()
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
    const box = page.getByRole('textbox', { name: /任务输入|Task input/ })
    await expect(box).toBeFocused()
    const trigger = page.locator('.header-project-btn')
    await expect(trigger).toBeVisible()
    const menu = page.getByRole('menu', { name: '当前项目选项' })
    await trigger.click()
    await expect(menu).toBeVisible()
    await expect(menu.getByText('当前工作区')).toBeVisible()
    await expect(menu.getByText('复制物理绝对路径')).toBeVisible()
    await page.locator('.header h1').click()
    await expect(menu).toBeHidden()
  })

  test('split diff toggles between side-by-side and unified view and remembers preference in localStorage', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()

    const injectChange = async () => {
      await page.evaluate(() => {
        const store = (window as unknown as { __CCWEB_STORE__?: { setState: (s: unknown) => void } }).__CCWEB_STORE__
        store?.setState({
          entries: [
            {
              type: 'turn',
              id: 'turn-1',
              done: true,
              blocks: [
                {
                  kind: 'tool',
                  toolUseId: 'tool-diff-1',
                  toolName: 'Edit',
                  inputRaw: '{}',
                  input: { file_path: 'src/example.ts', old_string: 'const v = 1', new_string: 'const v = 2' },
                  status: 'done',
                },
              ],
            },
          ],
        })
      })
    }

    await injectChange()
    await page.keyboard.press('Control+j')
    const drawer = page.getByRole('complementary', { name: /本次改动|Changes/ })
    await expect(drawer).toBeVisible()

    // 显式展开文件变更详情，触发 DiffView 挂载
    const fileItem = drawer.locator('.change-file').first()
    await fileItem.locator('summary').click()
    await expect(fileItem).toHaveAttribute('open', '')
    await expect(drawer.locator('.diff-wrap')).toBeVisible()

    // 默认模式为统一单列比对 (unified)
    await expect(drawer.locator('.diff-view:not(.diff-view-split)')).toBeVisible()
    await expect(drawer.locator('.diff-line')).toHaveCount(2)
    await expect(drawer.locator('.diff-line.del')).toContainText('const v = 1')
    await expect(drawer.locator('.diff-line.add')).toContainText('const v = 2')
    await expect(drawer.locator('.diff-view-split')).toHaveCount(0)

    const toggleBtn = drawer.getByRole('button', { name: '切换比对模式' })
    await expect(toggleBtn).toBeVisible()
    await expect(toggleBtn).toHaveAttribute('title', /切换为并排双栏比对/)

    // 点击切换为并排 (split)
    await toggleBtn.click()
    const savedMode = await page.evaluate(() => localStorage.getItem('ccweb_diff_mode'))
    expect(savedMode).toBe('split')
    await expect(toggleBtn).toHaveAttribute('title', /切换为单列统一比对/)

    // 真实 DOM 深度断言：并排双栏结构已挂载且代码行正确拆分
    await expect(drawer.locator('.diff-view-split')).toBeVisible()
    await expect(drawer.locator('.diff-split-header')).toBeVisible()
    const splitRows = drawer.locator('.diff-split-row')
    await expect(splitRows).toHaveCount(1)
    await expect(splitRows.locator('.diff-split-cell.left')).toContainText('const v = 1')
    await expect(splitRows.locator('.diff-split-cell.right')).toContainText('const v = 2')

    // 刷新页面，验证 localStorage 偏好保持
    await page.reload()
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    const reloadedMode = await page.evaluate(() => localStorage.getItem('ccweb_diff_mode'))
    expect(reloadedMode).toBe('split')

    // 重新注入变更并打开抽屉，验证仍处于 split 模式并能切换回 unified
    await injectChange()
    await page.keyboard.press('Control+j')
    const drawerAfterReload = page.getByRole('complementary', { name: /本次改动|Changes/ })
    await expect(drawerAfterReload).toBeVisible()
    const toggleBtnAfterReload = drawerAfterReload.getByRole('button', { name: '切换比对模式' })
    await expect(toggleBtnAfterReload).toHaveAttribute('title', /切换为单列统一比对/)

    // 展开变更文件详情，断言持久化保持后的 DOM 并排渲染
    const reloadedFileItem = drawerAfterReload.locator('.change-file').first()
    await reloadedFileItem.locator('summary').click()
    await expect(drawerAfterReload.locator('.diff-wrap')).toBeVisible()
    await expect(drawerAfterReload.locator('.diff-view-split')).toBeVisible()
    await expect(drawerAfterReload.locator('.diff-split-row')).toHaveCount(1)

    // 再次点击恢复为 unified
    await toggleBtnAfterReload.click()
    const restoredMode = await page.evaluate(() => localStorage.getItem('ccweb_diff_mode'))
    expect(restoredMode).toBe('unified')
    await expect(toggleBtnAfterReload).toHaveAttribute('title', /切换为并排双栏比对/)

    // 真实 DOM 深度断言：并排双栏结构已卸载，单列行结构已恢复
    await expect(drawerAfterReload.locator('.diff-view-split')).toHaveCount(0)
    await expect(drawerAfterReload.locator('.diff-view:not(.diff-view-split)')).toBeVisible()
    await expect(drawerAfterReload.locator('.diff-line')).toHaveCount(2)
    await expect(drawerAfterReload.locator('.diff-line.del')).toContainText('const v = 1')
    await expect(drawerAfterReload.locator('.diff-line.add')).toContainText('const v = 2')

    // 验证脏值白名单容错：写入非法值后重新读取，应安全回退为 unified
    await page.evaluate(() => localStorage.setItem('ccweb_diff_mode', 'invalid_corrupted_value'))
    await page.reload()
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
    await injectChange()
    await page.keyboard.press('Control+j')
    const drawerCorrupt = page.getByRole('complementary', { name: /本次改动|Changes/ })
    await expect(drawerCorrupt).toBeVisible()
    const toggleBtnCorrupt = drawerCorrupt.getByRole('button', { name: '切换比对模式' })
    await expect(toggleBtnCorrupt).toHaveAttribute('title', /切换为并排双栏比对/)
    await drawerCorrupt.locator('.change-file summary').first().click()
    await expect(drawerCorrupt.locator('.diff-view:not(.diff-view-split)')).toBeVisible()
    await expect(drawerCorrupt.locator('.diff-view-split')).toHaveCount(0)
  })

  test('plan panel parses steps, toggles checkboxes and persists to disk via write-plan API', async ({ page }) => {
    // 拦截 read-file 请求，返回测试用 plan 内容
    await page.route('**/api/workspaces/read-file', async (route) => {
      const data = route.request().postDataJSON() as { path?: string }
      if (data?.path === 'implementation_plan.md') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            content: '# E2E 实施计划\n\n- [ ] 步骤一：测试自动化回归\n- [x] 步骤二：历史用例基准',
          }),
        })
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Not found' }),
        })
      }
    })

    // 拦截 write-plan 请求并记录 payload
    let writePayload: { path?: string; content?: string } | null = null
    await page.route('**/api/workspaces/write-plan', async (route) => {
      writePayload = route.request().postDataJSON() as { path?: string; content?: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/')
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()

    // 通过命令面板打开 Plan 抽屉
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: '命令面板' })
    await expect(palette).toBeVisible()
    await palette.getByRole('button', { name: /打开伴侣抽屉: 实施计划跟踪/ }).click()

    const planDrawer = page.getByRole('complementary', { name: /实施计划伴侣|Plan/ })
    await expect(planDrawer).toBeVisible()

    // 验证解析出待办步骤并点击第一个未完成项
    const firstCheck = planDrawer.locator('.plan-step-check').first()
    await expect(firstCheck).toBeVisible()
    await firstCheck.click()

    // 验证触发 write-plan API 且 payload 包含更新后的 [x] 内容
    await expect.poll(() => writePayload).not.toBeNull()
    expect(writePayload?.path).toBe('implementation_plan.md')
    expect(writePayload?.content).toContain('- [x] 步骤一：测试自动化回归')

    // 验证成功 toast 提示
    await expect(page.getByText(/已同步更新.*进度/)).toBeVisible()
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
