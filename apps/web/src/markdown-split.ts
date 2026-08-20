/** 围栏行(``` 或 ~~~,最多 3 空格缩进) */
const FENCE_RE = /^\s{0,3}(```|~~~)/

/**
 * 流式增量拆段:按空行分段(`` \n\n `` 边界),``` 围栏内的空行不拆。
 * 连续空行折叠为单一边界;尾部未闭合围栏整体归入当前段(流式中不闪拆)。
 */
export function splitMarkdown(text: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let inFence = false
  const flush = () => {
    if (cur.some((l) => l.trim() !== '')) out.push(cur.join('\n'))
    cur = []
  }
  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      cur.push(line)
      continue
    }
    if (!inFence && line.trim() === '') {
      flush()
      continue
    }
    cur.push(line)
  }
  flush()
  return out
}
