import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runtimeSettings } from './settings.js'

/**
 * @文件补全:工作区递归文件搜索(本地单人工具,同步扫足够)。
 * 规则:忽略 node_modules/.git/dist;相对路径(POSIX 分隔符)不分大小写含 query 即匹配;
 * 字母序确定性遍历,取前 15 条。任何扫描异常按"无结果"处理,绝不抛给 WS 层。
 */

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist'])
const MAX_RESULTS = 15
const MAX_DEPTH = 10

export function searchWorkspaceFiles(query: string): string[] {
  const root = runtimeSettings.workspace ?? process.cwd()
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
