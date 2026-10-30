import { expect, test } from '@playwright/test'

test.describe('ccweb shell', () => {
  test('boots and renders the empty state', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/ccweb/)
    await expect(page.getByRole('heading', { name: /今天做点什么|What are we building/ })).toBeVisible()
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
    await expect(page.getByText(/^(已连接|Connected)$/)).toBeVisible()
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
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'settings', exact: true })).toBeVisible()
  await expect.poll(() => reads).toBe(before + 1)
  // This is deliberately an idle window: responses used to trigger an endless fetch/render loop.
  await page.waitForTimeout(10_000)
  expect(reads).toBe(before + 1)
  await page.getByRole('tab', { name: 'Skills', exact: true }).click()
  expect(reads).toBe(before + 1)
  await page.getByRole('dialog', { name: 'settings', exact: true }).press('Escape')
  await expect(page.getByRole('dialog', { name: 'settings', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await expect.poll(() => reads).toBe(before + 2)
})
