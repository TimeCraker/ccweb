/** 路径展示辅助:Windows / POSIX 混合,不改变真实路径语义。 */

export function baseName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}

/** 临时目录判定:仅用于视觉降权与排序,不隐藏、不改写用户路径。 */
export function isTempPath(dir: string): boolean {
  return /[\\/](?:temp|tmp)[\\/]/i.test(dir) || /AppData[\\/]Local[\\/]Temp/i.test(dir)
}

/** 长路径中间省略,保留盘符/根与末尾目录,便于区分同名项目。 */
export function compactPath(dir: string, max = 44): string {
  if (dir.length <= max) return dir
  const parts = dir.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return dir
  const head = parts[0]
  const tail = parts.slice(-2).join('\\')
  const candidate = `${head}\\…\\${tail}`
  if (candidate.length <= max) return candidate
  return `${head}\\…\\${parts[parts.length - 1]}`
}
