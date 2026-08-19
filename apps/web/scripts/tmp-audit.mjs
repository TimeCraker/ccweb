/** ccweb UI/UX 审计脚本(Agent B):只读实测,不改源码 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../../docs/audit')
fs.mkdirSync(OUT, { recursive: true })

const URL = 'http://127.0.0.1:3477'
const consoleLogs = []
const pageErrors = []
const failedRequests = []

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

page.on('console', (m) => {
  const t = m.type()
  if (t === 'error' || t === 'warning') consoleLogs.push(`[console.${t}] ${m.text()}`)
})
page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => failedRequests.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`))

const shot = (name) => page.screenshot({ path: path.join(OUT, `agentb-${name}.png`) })
const log = (...a) => console.log('[audit]', ...a)

async function waitConnected(timeout = 15000) {
  await page.waitForSelector('text=已连接', { timeout })
}

async function waitTurnDone(timeout = 120000) {
  // busy 时 placeholder = 正在生成…按 Esc 中断;结束时恢复
  await page.waitForFunction(
    () => {
      const ta = document.querySelector('textarea')
      return ta && !ta.placeholder.includes('正在生成')
    },
    { timeout },
  )
  await page.waitForTimeout(600)
}

async function send(text) {
  await page.fill('textarea', text)
  await page.press('textarea', 'Enter')
}

// ---------- a. 空态 hero(1280x900) ----------
await page.goto(URL, { waitUntil: 'networkidle' })
await waitConnected()
await page.waitForTimeout(800)
await shot('01-hero-1280')
log('01 hero done')

// ---------- b. 1000px ----------
await page.setViewportSize({ width: 1000, height: 900 })
await page.waitForTimeout(400)
await shot('02-hero-1000')
log('02 1000px done')

// ---------- c. 700px ----------
await page.setViewportSize({ width: 700, height: 900 })
await page.waitForTimeout(400)
await shot('03-hero-700')
// 700px 下布局溢出检查
const overflow700 = await page.evaluate(() => {
  const doc = document.documentElement
  return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, overflow: doc.scrollWidth > doc.clientWidth }
})
log('700px overflow check:', JSON.stringify(overflow700))
await page.setViewportSize({ width: 1280, height: 900 })
await page.waitForTimeout(300)

// ---------- d. 发送一条消息 ----------
await send('用一句话介绍你自己,不要用工具')
await waitTurnDone()
await shot('04-chat-1280')
log('04 chat done')

// ---------- e1. Ctrl+K 命令面板 ----------
await page.keyboard.press('Control+k')
await page.waitForTimeout(400)
await shot('05-palette')
// 键盘导航:按 12 次 Down,检查选中项是否滚入可视区
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ---------- e2. Ctrl+, 设置逐 tab ----------
await page.keyboard.press('Control+Comma')
await page.waitForTimeout(500)
// 关闭按钮位置检查(疑似定位到视口右上角)
const closePos = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="close settings"]')
  const dlg = document.querySelector('[role="dialog"][aria-label="settings"]')
  if (!btn || !dlg) return null
  const b = btn.getBoundingClientRect()
  const d = dlg.getBoundingClientRect()
  return {
    btn: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
    dialog: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
    insideDialog: b.x >= d.x && b.x + b.width <= d.x + d.width && b.y >= d.y && b.y <= d.y + d.height,
  }
})
log('settings close button pos:', JSON.stringify(closePos))
const tabs = ['模型', '端点', '权限', 'Skills', '规则', 'MCP']
let ti = 0
for (const t of tabs) {
  await page.click(`[role="dialog"] nav button:has-text("${t}")`)
  await page.waitForTimeout(300)
  await shot(`06-settings-${['model', 'endpoint', 'permission', 'skills', 'rules', 'mcp'][ti]}`)
  ti++
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ---------- g. 连发 2 条 + 代码块消息,向上滚动 ----------
await send('回复两个字:收到')
await waitTurnDone()
await send('请输出一个 markdown 代码块,内容为 3 行 javascript 示例,不要多余解释')
await waitTurnDone()
await shot('07-chat-codeblock')
// 向上滚动
await page.mouse.move(640, 450)
await page.mouse.wheel(0, -3000)
await page.waitForTimeout(600)
await shot('08-chat-scrolled-top')
// 检查复制按钮位置溢出(hover assistant 块时)
const copyBtnCheck = await page.evaluate(() => {
  const btn = document.querySelector('[role="log"] button[aria-label="copy message"]')
  if (!btn) return null
  const r = btn.getBoundingClientRect()
  return { x: Math.round(r.x), right: Math.round(r.right), vw: window.innerWidth }
})
log('copy btn rect:', JSON.stringify(copyBtnCheck))

// ---------- h. 浅色主题(含代码块,验证 hljs 配色) ----------
await page.click('button[aria-label="toggle theme"]')
await page.waitForTimeout(500)
await shot('09-light-chat')
const hljsLight = await page.evaluate(() => {
  const code = document.querySelector('.md pre code span[class*="hljs-"]')
  const pre = document.querySelector('.md pre')
  if (!code || !pre) return null
  return {
    spanColor: getComputedStyle(code).color,
    preBg: getComputedStyle(pre).backgroundColor,
    preBorder: getComputedStyle(pre).borderColor,
  }
})
log('light theme hljs:', JSON.stringify(hljsLight))
await page.click('button[aria-label="toggle theme"]')
await page.waitForTimeout(300)

// ---------- i. 仅图片时发送按钮 disabled 检查 ----------
await page.setInputFiles('input[type="file"][accept="image/*"]', {
  name: 'test.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
})
await page.waitForTimeout(500)
const sendDisabled = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="发送"]')
  const imgs = document.querySelectorAll('img[alt^="attachment"]')
  return { disabled: btn ? btn.disabled : null, attachmentCount: imgs.length }
})
log('image-only send button:', JSON.stringify(sendDisabled))
await shot('10-image-only-disabled')
// 清掉图片(移除按钮 hover 显示,用 keyboard focus 或 evaluate click)
await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="移除图片"]')
  btn?.click()
})
await page.waitForTimeout(300)

// ---------- j. Ctrl+B 折叠侧栏(hooks 规则验证) ----------
await page.keyboard.press('Control+b')
await page.waitForTimeout(500)
await shot('11-sidebar-collapsed')
await page.keyboard.press('Control+b')
await page.waitForTimeout(800)
await shot('12-sidebar-expanded-after-collapse')
const crashCheck = await page.evaluate(() => ({
  hasErrorBoundary: !!document.body.innerText.match(/出错|Error|崩溃|重新加载/i),
  bodySnippet: document.body.innerText.slice(0, 120),
}))
log('after Ctrl+B toggle x2:', JSON.stringify(crashCheck))

// ---------- k. 命令面板键盘导航可视区检查 ----------
await page.keyboard.press('Control+k')
await page.waitForTimeout(300)
for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
const selVisible = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[role="dialog"][aria-label="command palette"] .max-h-72 button')]
  const active = items.find((b) => b.className.includes('bg-panel-2'))
  if (!active) return null
  const r = active.getBoundingClientRect()
  const box = active.closest('.max-h-72').getBoundingClientRect()
  return { btnTop: Math.round(r.top), btnBottom: Math.round(r.bottom), boxTop: Math.round(box.top), boxBottom: Math.round(box.bottom), visibleInList: r.top >= box.top && r.bottom <= box.bottom }
})
log('palette selection visible:', JSON.stringify(selVisible))
await shot('13-palette-keyboard-nav')
await page.keyboard.press('Escape')

// ---------- 汇总 ----------
const report = { consoleLogs, pageErrors, failedRequests, checks: { overflow700, closePos, copyBtnCheck, hljsLight, sendDisabled, crashCheck, selVisible } }
fs.writeFileSync(path.join(OUT, 'agentb-console-report.json'), JSON.stringify(report, null, 2))
log('report saved')

await browser.close()
