import { describe, expect, it } from 'vitest'
import { splitMarkdown } from './markdown-split'

describe('splitMarkdown(增量渲染拆段)', () => {
  it('普通段落按空行拆分', () => {
    expect(splitMarkdown('第一段\n\n第二段\n\n第三段')).toEqual(['第一段', '第二段', '第三段'])
  })

  it('无空行的单段文本不拆', () => {
    expect(splitMarkdown('hello world')).toEqual(['hello world'])
    expect(splitMarkdown('line1\nline2')).toEqual(['line1\nline2'])
  })

  it('围栏内的空行不作为拆分点', () => {
    const md = 'intro\n\n```js\nconst a = 1\n\nconst b = 2\n```\n\noutro'
    expect(splitMarkdown(md)).toEqual(['intro', '```js\nconst a = 1\n\nconst b = 2\n```', 'outro'])
  })

  it('多个围栏各自独立保护,之间可拆', () => {
    const md = '```python\nx = 1\n\ny = 2\n```\n\n中缝\n\n```bash\nls\n```'
    expect(splitMarkdown(md)).toEqual([
      '```python\nx = 1\n\ny = 2\n```',
      '中缝',
      '```bash\nls\n```',
    ])
  })

  it('流式中未闭合围栏整体归入末段(不闪拆)', () => {
    const md = '正文\n\n```ts\nconst x ='
    expect(splitMarkdown(md)).toEqual(['正文', '```ts\nconst x ='])
  })

  it('~~~ 围栏同样受保护', () => {
    const md = 'a\n\n~~~\n空行内\n\n~~~\n\nb'
    expect(splitMarkdown(md)).toEqual(['a', '~~~\n空行内\n\n~~~', 'b'])
  })

  it('连续空行折叠为单一边界,不产生空段', () => {
    expect(splitMarkdown('a\n\n\n\n\nb')).toEqual(['a', 'b'])
    expect(splitMarkdown('a\n\n\n\n')).toEqual(['a'])
  })

  it('空文本与纯空白返回空数组', () => {
    expect(splitMarkdown('')).toEqual([])
    expect(splitMarkdown('\n\n\n')).toEqual([])
  })
})
