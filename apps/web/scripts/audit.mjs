/**
 * ccweb 自测审计:真实走一遍核心交互,收集 console 错误与截图。
 * 输出:docs/audit/<name>.png + 终端问题清单。
 */
import { chromium } from '@playwright/test'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', '..', 'docs', 'audit')
mkdirSync(outDir, { recursive: true })

const issues = []
const consoleErrors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200))
})
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${String(err).slice(0, 200)}`))

/** 等待关键内容渲染完成再截;并做非空白校验(空白启发式:<40KB) */
async function shot(name, waitSel) {
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 10_000 }).catch(() => issues.push(`[shot:${name}] selector 未出现: ${waitSel}`))
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(600)
  const file = join(outDir, `${name}.png`)
  await page.screenshot({ path: file })
  const size = statSync(file).size
  if (size < 40_000) issues.push(`[shot:${name}] 疑似空白图(${Math.round(size / 1024)}KB)`)
  console.log(`  ✓ ${name}.png (${Math.round(size / 1024)}KB)`)
}

console.log('== 1. 加载与空态(hero)==')
await page.goto('http://127.0.0.1:3477', { waitUntil: 'networkidle' })
await page.waitForSelector('textarea', { timeout: 10_000 })
await shot('01-empty-dark', 'aside')
const connOk = await page.locator('text=已连接').isVisible().catch(() => false)
if (!connOk) issues.push('初始连接状态未显示"已连接"')

console.log('== 2. 发送真实消息(流式) ==')
await page.fill('textarea', '用一句话介绍你自己,不要使用任何工具。')
await page.keyboard.press('Enter')
// 等助手回复开始(打字机文本出现)
await page.waitForSelector('text=.', { timeout: 60_000 }).catch(() => {})
await page.waitForTimeout(3000)
const streamingVisible = await page.locator('.stream-caret').first().isVisible().catch(() => false)
console.log('  流式光标出现:', streamingVisible)
await shot('02-streaming')

console.log('== 3. 等待回合结束 + 指标条 ==')
await page.waitForSelector('button[aria-label="发送"]', { timeout: 90_000 }).catch(() => issues.push('回合未在 90s 内结束(发送按钮未恢复)'))
await page.waitForTimeout(800)
const metricsText = await page.locator('main').textContent().catch(() => null)
if (!metricsText || !metricsText.includes('TTFT')) issues.push('指标条未渲染或缺少 TTFT')
await shot('03-turn-done')

console.log('== 4. 命令面板 ==')
await page.keyboard.press('Control+k')
await page.waitForSelector('input[placeholder*="命令"]', { timeout: 5000 }).catch(() => issues.push('Ctrl+K 命令面板未打开'))
await shot('04-palette', 'input[placeholder*="命令"]')
await page.keyboard.press('Escape')

console.log('== 5. 设置弹窗 + 焦点陷阱 ==')
await page.keyboard.press('Control+,')
await page.waitForSelector('[role="dialog"][aria-label="settings"]', { timeout: 5000 }).catch(() => issues.push('设置弹窗未打开'))
const focusedInDialog = await page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]')
  return !!dlg && dlg.contains(document.activeElement)
})
if (!focusedInDialog) issues.push('设置弹窗打开后焦点未进入弹窗')
await shot('05-settings', '[role="dialog"][aria-label="settings"]')
// Esc 关闭
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const dialogGone = await page.locator('[role="dialog"][aria-label="settings"]').isHidden().catch(() => true)
if (!dialogGone) issues.push('Esc 未关闭设置弹窗')

console.log('== 6. 浅色主题 ==')
await page.evaluate(() => localStorage.setItem('ccweb.theme', 'light'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('textarea, [role="log"]', { timeout: 10_000 }).catch(() => {})
await page.waitForTimeout(600)
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
console.log('  浅色 body bg:', bgLight)
if (bgLight.includes('0, 0, 0') || bgLight === 'rgb(11, 11, 16)') issues.push(`浅色主题未生效, body=${bgLight}`)
await shot('06-light')

console.log('== 7. 恢复暗色 + 侧栏会话列表 ==')
await page.evaluate(() => localStorage.setItem('ccweb.theme', 'dark'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const sessionRows = await page.locator('aside .group').count()
console.log('  侧栏会话行数:', sessionRows)
if (sessionRows === 0) issues.push('侧栏历史会话列表为空')

await browser.close()

console.log('\n========== 审计结果 ==========')
if (consoleErrors.length) {
  console.log(`Console 错误 (${consoleErrors.length}):`)
  for (const e of consoleErrors.slice(0, 10)) console.log('  -', e)
} else {
  console.log('Console 错误: 0 ✓')
}
if (issues.length) {
  console.log(`\n问题清单 (${issues.length}):`)
  for (const i of issues) console.log('  ✗', i)
  process.exit(1)
} else {
  console.log('问题清单: 0 ✓ 全部通过')
}
