/** ccweb UI/UX 审计补充脚本(Agent B round 2) */
import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../../docs/audit')

const URL = 'http://127.0.0.1:3477'
const consoleLogs = []
const pageErrors = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addInitScript(() => localStorage.setItem('ccweb.theme', 'dark'))
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleLogs.push(`[console.${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`))

const shot = (n) => page.screenshot({ path: path.join(OUT, `agentb-${n}.png`) })
const log = (...a) => console.log('[audit2]', ...a)

const lum = (r, g, b) => {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (c1, c2) => {
  const l1 = lum(...c1)
  const l2 = lum(...c2)
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)
}
const parseRGB = (s) => s.match(/\d+/g).slice(0, 3).map(Number)

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('text=已连接', { timeout: 15000 })
await page.waitForTimeout(600)
const themeNow = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), bg: getComputedStyle(document.body).backgroundColor }))
log('theme:', JSON.stringify(themeNow))

// ---------- 1. 命令面板键盘导航可见性(未过滤长列表) ----------
await page.keyboard.press('Control+k')
await page.waitForTimeout(300)
const itemCount = await page.evaluate(() => document.querySelectorAll('[aria-label="command palette"] .max-h-72 button').length)
for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
const selVis = await page.evaluate(() => {
  const box = document.querySelector('[aria-label="command palette"] .max-h-72')
  if (!box) return null
  const br = box.getBoundingClientRect()
  const active = [...box.querySelectorAll('button')].find((b) => b.className.includes('bg-panel-2'))
  if (!active) return { foundActive: false, itemCount: box.querySelectorAll('button').length }
  const r = active.getBoundingClientRect()
  return {
    foundActive: true,
    visibleInList: r.top >= br.top && r.bottom <= br.bottom,
    btnBottom: Math.round(r.bottom),
    listBottom: Math.round(br.bottom),
    text: active.textContent.slice(0, 30),
  }
})
log('palette sel visible:', JSON.stringify({ filterCount: itemCount, selVis }))
await shot('14-palette-keynav')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ---------- 2. 新会话 + 触发工具/权限卡 ----------
await page.keyboard.press('Control+n')
await page.waitForTimeout(800)
let permShown = false
let hasTool = false
for (let attempt = 1; attempt <= 2 && !hasTool; attempt++) {
  await page.fill('textarea', attempt === 1 ? '执行 bash 命令:echo ccweb-audit(必须真的执行,把 stdout 告诉我)' : '用 Bash 工具运行 echo ccweb-audit 并给出输出')
  await page.press('textarea', 'Enter')
  try {
    await page.waitForSelector('text=操作需要确认', { timeout: 45000 })
    permShown = true
  } catch {}
  if (permShown) {
    await shot('15-permission-card')
    await page.click('button:has-text("允许")')
  }
  await page.waitForFunction(() => {
    const ta = document.querySelector('textarea')
    return ta && !ta.placeholder.includes('正在生成')
  }, { timeout: 120000 })
  await page.waitForTimeout(800)
  hasTool = (await page.evaluate(() => document.querySelectorAll('.tool-card').length)) > 0
  log(`attempt ${attempt}: permShown=${permShown} hasTool=${hasTool}`)
}
await shot('16-toolcard-expanded')

// ToolCard 收起测试:Bash done 后点击两次 header,看展开状态
let toolBefore = null
let toolAfter1 = null
let toolAfter2 = null
if (hasTool) {
  toolBefore = await page.evaluate(() => {
    const c = document.querySelector('.tool-expand')
    return c ? { open: c.classList.contains('open') } : null
  })
  try {
    await page.click('.tool-card button[aria-expanded]', { timeout: 5000 })
    await page.waitForTimeout(400)
    toolAfter1 = await page.evaluate(() => {
      const c = document.querySelector('.tool-expand')
      const h = c ? c.getBoundingClientRect().height : -1
      return c ? { open: c.classList.contains('open'), height: Math.round(h) } : null
    })
    await page.click('.tool-card button[aria-expanded]', { timeout: 5000 })
    await page.waitForTimeout(400)
    toolAfter2 = await page.evaluate(() => {
      const c = document.querySelector('.tool-expand')
      const h = c ? c.getBoundingClientRect().height : -1
      return c ? { open: c.classList.contains('open'), height: Math.round(h) } : null
    })
  } catch (e) {
    log('toolcard click failed:', e.message.slice(0, 80))
  }
  log('toolcard toggle:', JSON.stringify({ toolBefore, toolAfter1, toolAfter2 }))
  await shot('17-toolcard-after-two-clicks')
}

// ---------- 3. 浅色主题代码块颜色采样 ----------
// 先有代码块:发一条要代码块的消息
await page.fill('textarea', '输出一个 3 行 javascript 代码块,不要解释')
await page.press('textarea', 'Enter')
await page.waitForFunction(() => {
  const ta = document.querySelector('textarea')
  return ta && !ta.placeholder.includes('正在生成')
}, { timeout: 120000 })
await page.waitForTimeout(500)
await page.click('button[aria-label="toggle theme"]')
await page.waitForTimeout(500)
const lightSample = await page.evaluate(() => {
  const pre = document.querySelector('.md pre')
  if (!pre) return null
  const cs = getComputedStyle(pre)
  const tokens = [...document.querySelectorAll('.md pre code [class*="hljs-"]')].slice(0, 6).map((t) => ({
    cls: t.className,
    color: getComputedStyle(t).color,
    text: t.textContent.slice(0, 12),
  }))
  return {
    bodyBg: getComputedStyle(document.body).backgroundColor,
    preBg: cs.backgroundColor,
    preText: getComputedStyle(pre.querySelector('code') ?? pre).color,
    tokens,
  }
})
log('light code sample:', JSON.stringify(lightSample))
await shot('18-light-codeblock')
// 对比度计算
if (lightSample) {
  const preBg = parseRGB(lightSample.preBg)
  const pairs = [['preText', parseRGB(lightSample.preText), preBg]]
  for (const t of lightSample.tokens ?? []) pairs.push([t.cls, parseRGB(t.color), preBg])
  for (const [name, fg, bg] of pairs) log(`contrast ${name}: ${contrast(fg, bg)}:1`)
}

// ---------- 4. 1000px 对话态 ----------
await page.click('button[aria-label="toggle theme"]') // 回 dark
await page.waitForTimeout(300)
await page.setViewportSize({ width: 1000, height: 900 })
await page.waitForTimeout(400)
await shot('19-chat-1000')
await page.setViewportSize({ width: 1280, height: 900 })

// ---------- 5. Ctrl+B 单次折叠(崩溃确认) ----------
await page.keyboard.press('Control+b')
await page.waitForTimeout(700)
const crash1 = await page.evaluate(() => document.body.innerText.slice(0, 100))
log('after first Ctrl+B:', JSON.stringify(crash1))
await shot('20-ctrlb-once')

// ---------- 6. 侧栏 hover 操作按钮(键盘可达性粗查) ----------
// reload 恢复
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=已连接', { timeout: 15000 })
await page.waitForTimeout(600)
const copyBtnFocus = await page.evaluate(() => {
  // 消息复制按钮 opacity-0,无 focus-visible 处理;检查 tabindex
  const btn = document.querySelector('[role="log"] button[aria-label="copy message"]')
  if (!btn) return { exists: false }
  const cs = getComputedStyle(btn)
  return { exists: true, opacity: cs.opacity, tabindex: btn.getAttribute('tabindex') }
})
log('copy btn a11y:', JSON.stringify(copyBtnFocus))

fs.writeFileSync(
  path.join(OUT, 'agentb-audit2-report.json'),
  JSON.stringify({ consoleLogs, pageErrors, selVis: { itemCount, selVis }, toolcard: { toolBefore, toolAfter1, toolAfter2 }, permShown, lightSample, crash1, copyBtnFocus }, null, 2),
)
log('done')
await browser.close()
