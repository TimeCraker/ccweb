import { describe, expect, it } from 'vitest'
import { ansiToSegments } from './ansi'

describe('ansiToSegments', () => {
  it('returns plain text as a single segment when no escapes', () => {
    expect(ansiToSegments('hello ccweb')).toEqual([{ text: 'hello ccweb' }])
    expect(ansiToSegments('')).toEqual([])
  })

  it('applies a pure foreground color', () => {
    expect(ansiToSegments('\x1b[31mred\x1b[0m')).toEqual([{ text: 'red', fg: '#f87171' }])
    expect(ansiToSegments('\x1b[92mbright')).toEqual([{ text: 'bright', fg: '#86efac' }])
  })

  it('reset (0) clears color and bold for subsequent text', () => {
    expect(ansiToSegments('\x1b[32mgreen\x1b[0mplain')).toEqual([
      { text: 'green', fg: '#4ade80' },
      { text: 'plain' },
    ])
    // \x1b[m 等效 \x1b[0m
    expect(ansiToSegments('\x1b[1mbold\x1b[mok')).toEqual([
      { text: 'bold', bold: true },
      { text: 'ok' },
    ])
  })

  it('supports multi-param SGR (bold + color) and 39 default fg', () => {
    expect(ansiToSegments('\x1b[1;33mwarn\x1b[0m')).toEqual([
      { text: 'warn', fg: '#facc15', bold: true },
    ])
    expect(ansiToSegments('\x1b[34mblue\x1b[39mafter')).toEqual([
      { text: 'blue', fg: '#6e79f0' },
      { text: 'after' },
    ])
  })

  it('ignores unsupported SGR codes without breaking state', () => {
    // 4 = 下划线(不支持,忽略);颜色保持
    expect(ansiToSegments('\x1b[31;4mtext')).toEqual([{ text: 'text', fg: '#f87171' }])
  })

  it('handles mixed plain and colored runs in order', () => {
    expect(ansiToSegments('a\x1b[36mb\x1b[0mc')).toEqual([
      { text: 'a' },
      { text: 'b', fg: '#22d3ee' },
      { text: 'c' },
    ])
  })
})
