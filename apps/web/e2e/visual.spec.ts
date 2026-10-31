import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:3495', viewport: { width: 1440, height: 960 } })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ccweb.locale', 'zh')
    localStorage.setItem('ccweb.theme', 'system')
  })
})

test('V3 workbench, brand and composer stay coherent at four widths', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '工作方式', exact: true })).toBeEnabled()
  await expect(page.locator('.brand-row .tc-brand-mark img')).toHaveAttribute('src', '/brand/timecraker-mark-v1.svg')
  expect(await page.locator('link[rel=icon]').getAttribute('href')).toContain('timecraker-favicon')
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 960 })
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme })
      await expect(page.locator('.composer')).toBeInViewport()
      const card = await page.locator('.composer').boundingBox()
      const mode = await page.getByRole('button', { name: '工作方式', exact: true }).boundingBox()
      expect(card && mode && mode.y >= card.y && mode.y + mode.height <= card.y + card.height).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`empty-${colorScheme}-${width}.png`), animations: 'disabled' })
    }
  }
})

test('running, tool and approval surfaces retain readable proportions', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '工作方式', exact: true })).toBeEnabled()
  const input = page.getByRole('textbox', { name: '任务输入' })
  await input.fill('VISUAL 视觉验收：完善模式切换，保留现有文件改动。')
  await input.press('Enter')
  await expect(page.locator('.tool-card').first()).toBeVisible()
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeInViewport()
    await expect(page.locator('.usage')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`running-dark-${width}.png`), animations: 'disabled' })
  }
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  await page.locator('.sidebar-new').click()
  await page.getByRole('textbox', { name: '任务输入' }).fill('APPROVAL 视觉审批')
  await page.getByRole('textbox', { name: '任务输入' }).press('Enter')
  await expect(page.locator('.permission-card')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: info.outputPath('approval-dark-1440.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
})

test('skill editor keeps source badges, shared draft and reachable save actions', async ({ page }, info) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '工作方式', exact: true })).toBeEnabled()
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('tab', { name: '技能', exact: true }).click()
  const suffix = Date.now().toString(36).slice(-4)
  const name = `review-changes-${suffix}`
  await dialog.getByRole('button', { name: '新建', exact: true }).click()
  await page.locator('.resource-create').getByLabel('名称').fill(name)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.locator('.editor-head h4')).toContainText(name)
  await page.getByLabel('说明', { exact: true }).fill('提交前审查改动并报告可操作的问题')
  await page.getByLabel('正文', { exact: true }).fill('# Review changes\n- Inspect the changed files\n- Check behavior and tests\n- Report actionable findings\n')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  await page.getByLabel('说明', { exact: true }).fill('提交前审查改动并报告可操作的问题；保留现有实现')
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
    await expect(page.locator('.editor-head h4')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`skills-light-${width}.png`), animations: 'disabled' })
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: info.outputPath('skills-dark-1440.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
})
