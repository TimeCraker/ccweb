/**
 * 轻量 ANSI SGR 解析:Bash 等工具输出里的转义序列转带色 span 渲染。
 * 只处理颜色相关 SGR:30-37 / 90-97 前景色、1 加粗、0 重置、39 默认前景;
 * 其余 SGR 码(背景色/下划线等)安全忽略。颜色取 ccweb dev 主题近似值(#hex)。
 */

export interface AnsiSegment {
  text: string
  /** 前景色 #hex(dev 主题近似);缺省 = 默认文本色 */
  fg?: string
  bold?: boolean
}


/** 30-37 标准色 + 90-97 亮色 → dev 主题近似值 */
const FG: Record<number, string> = {
  30: '#5c5c68', // black → text-faint(纯黑在暗底不可见)
  31: '#f87171', // red → danger
  32: '#4ade80', // green → ok
  33: '#facc15', // yellow → warn
  34: '#6e79f0', // blue → accent
  35: '#c084fc', // magenta
  36: '#22d3ee', // cyan
  37: '#e9e9ef', // white → text
  90: '#8b8b98', // bright black → text-dim
  91: '#fca5a5',
  92: '#86efac',
  93: '#fde047',
  94: '#828cf5', // bright blue → accent-hover
  95: '#d8b4fe',
  96: '#67e8f9',
  97: '#ffffff',
}

// \x1b 是 ANSI 转义的定义性前缀,此处匹配控制字符是刻意行为
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[([0-9;]*)m/g

/**
 * 把含 ANSI SGR 转义的文本切成带样式片段。
 * 无转义时原样返回单片段;转义参数逐个应用,`\x1b[m` 等效 `\x1b[0m`。
 */
export function ansiToSegments(text: string): AnsiSegment[] {
  const out: AnsiSegment[] = []
  let fg: string | undefined
  let bold: boolean | undefined
  let last = 0
  SGR.lastIndex = 0
  for (let m = SGR.exec(text); m !== null; m = SGR.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), fg, bold })
    const params = m[1] ?? ''
    const codes = params === '' ? ['0'] : params.split(';')
    for (const raw of codes) {
      const code = raw === '' ? 0 : Number(raw)
      if (Number.isNaN(code)) continue
      if (code === 0) {
        fg = undefined
        bold = undefined
      } else if (code === 1) {
        bold = true
      } else if (code === 39) {
        fg = undefined
      } else {
        const c = FG[code]
        if (c) fg = c
      }
    }
    last = SGR.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last), fg, bold })
  return out
}
