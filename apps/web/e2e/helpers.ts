import { expect, type Page } from '@playwright/test'

/** 原生终端已从默认工作流移除:只能从设置 → 关于与更新进入(开发者排障入口)。 */
export async function openNativeTerminal(page: Page): Promise<void> {
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '关于与更新', exact: true }).click()
  await dialog.getByRole('button', { name: '打开原生终端' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: '原生终端' })).toBeVisible()
}

export async function openSettings(page: Page) {
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}
