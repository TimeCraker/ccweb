import { closeSync, constants, fstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { runtimeSettings } from './settings.js'

/**
 * @文件补全:工作区递归文件搜索(本地单人工具,同步扫足够)。
 * 规则:忽略 node_modules/.git/dist;相对路径(POSIX 分隔符)不分大小写含 query 即匹配;
 * 字母序确定性遍历,取前 15 条。任何扫描异常按"无结果"处理,绝不抛给 WS 层。
 */

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist'])
const MAX_RESULTS = 15
const MAX_DEPTH = 10
const MAX_REVIEW_BYTES = 64 * 1024

/** undefined 表示无法采集，null 表示文件尚不存在。 */
export function readWorkspaceSnapshot(workspace: string, file: string): string | null | undefined {
  const within = (root: string, target: string) => {
    const rel = relative(root, target)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  }
  try {
    const root = realpathSync(workspace)
    const target = resolve(workspace, file)
    if (!within(workspace, target) && !within(root, target)) return undefined
    let actual: string
    try {
      actual = realpathSync(target)
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : undefined
    }
    if (!within(root, actual)) return undefined
    const fd = openSync(actual, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > MAX_REVIEW_BYTES) return undefined
      const buffer = Buffer.alloc(stat.size + 1)
      let length = 0
      while (length < buffer.length) {
        const n = readSync(fd, buffer, length, buffer.length - length, null)
        if (n === 0) break
        length += n
      }
      if (length !== stat.size || buffer.subarray(0, length).includes(0)) return undefined
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length))
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
}

export function searchWorkspaceFiles(query: string, workspace?: string): string[] {
  const root = workspace ?? runtimeSettings.workspace ?? process.env.CCWEB_WORKSPACE ?? process.cwd()
  const out: string[] = []
  try {
    walk(root, '', query.toLowerCase(), out, 0)
  } catch {
    // 权限/不存在等任何失败 → 空结果
  }
  return out
}

function walk(dir: string, rel: string, q: string, out: string[], depth: number): void {
  if (out.length >= MAX_RESULTS || depth > MAX_DEPTH) return
  const entries = readdirSync(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    if (out.length >= MAX_RESULTS) return
    const childRel = rel ? `${rel}/${e.name}` : e.name
    if (e.isFile()) {
      // 文件名 ⊂ 相对路径,只查路径即可;query 为空串时全匹配(取前 15)
      if (childRel.toLowerCase().includes(q)) out.push(childRel)
    } else if (e.isDirectory() && !IGNORED_DIRS.has(e.name)) {
      // withFileTypes 不跟符号链接(dirent 类型为 symlink),无环风险
      walk(join(dir, e.name), childRel, q, out, depth + 1)
    }
  }
}
