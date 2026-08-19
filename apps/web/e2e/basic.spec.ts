import { expect, test } from '@playwright/test'

test.describe('ccweb shell', () => {
  test('boots and renders the empty state', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/ccweb/)
    await expect(page.getByText('开始新对话').or(page.getByText('Start a new conversation'))).toBeVisible()
  })

  test('composer accepts input and shows hint', async ({ page }) => {
    await page.goto('/')
    const box = page.locator('textarea')
    await expect(box).toBeVisible()
    await box.fill('hello')
    await expect(page.getByRole('button', { name: /发送|Send/ })).toBeEnabled()
  })

  test('Ctrl+K opens the command palette', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(
      page.getByPlaceholder(/命令或搜索|command or search/i),
    ).toBeVisible()
  })

  test('sidebar shows connection state', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByText('已连接').or(page.getByText('Connected')).or(page.getByText('连接中')),
    ).toBeVisible({ timeout: 15_000 })
  })
})
