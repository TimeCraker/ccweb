/** README 截图:主界面(暗)/命令面板/浅色主题。前置:pnpm build + server 已起。 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', '..', 'docs', 'screenshots')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })

await page.goto('http://127.0.0.1:3477')
await page.waitForTimeout(1500)

// 1. 主界面(暗色,含历史会话)
await page.screenshot({ path: join(outDir, 'main-dark.png') })
console.log('✓ main-dark.png')

// 2. 命令面板
await page.keyboard.press('Control+k')
await page.waitForTimeout(400)
await page.screenshot({ path: join(outDir, 'palette.png') })
console.log('✓ palette.png')
await page.keyboard.press('Escape')

// 3. 浅色主题
await page.evaluate(() => {
  localStorage.setItem('ccweb.theme', 'light')
})
await page.reload()
await page.waitForTimeout(1200)
await page.screenshot({ path: join(outDir, 'main-light.png') })
console.log('✓ main-light.png')

await browser.close()
console.log('done ->', outDir)
