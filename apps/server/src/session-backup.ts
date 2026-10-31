import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CC_DIR, APP_DIR } from './dirs.js'

/**
 * 会话删除备份与恢复。
 *
 * 原生 transcript 位于 ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl。
 * 删除前复制到 ~/.ccweb/backups/sessions,保留有限数量;恢复只允许写回
 * ~/.claude/projects 下的原始目录,不接受任意路径。
 */

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/
const MAX_BACKUPS = 30

const backupDir = () => join(APP_DIR, 'backups', 'sessions')
const projectsDir = () => join(CC_DIR, 'projects')

export interface DeletedSession {
  id: string
  title: string
  deletedAt: number
  projectDir: string
  bytes: number
}

function inside(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function findTranscript(sessionId: string): { file: string; projectDir: string } | null {
  const root = projectsDir()
  if (!existsSync(root)) return null
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const projectDir = join(root, entry.name)
    const file = join(projectDir, `${sessionId}.jsonl`)
    if (existsSync(file)) return { file, projectDir }
  }
  return null
}

function prune(): void {
  const dir = backupDir()
  if (!existsSync(dir)) return
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  for (const stale of files.slice(MAX_BACKUPS)) {
    const base = stale.name.slice(0, -'.json'.length)
    rmSync(join(dir, `${base}.jsonl`), { force: true })
    rmSync(join(dir, `${base}.json`), { force: true })
  }
}

/** 删除会话前调用:返回备份记录;没有原生 transcript(如纯模拟会话)时返回 null。 */
export function backupSession(sessionId: string, title = ''): DeletedSession | null {
  if (!ID_RE.test(sessionId)) return null
  const transcript = findTranscript(sessionId)
  if (!transcript) return null
  try {
    const bytes = statSync(transcript.file).size
    if (bytes === 0) return null
    const dir = backupDir()
    mkdirSync(dir, { recursive: true })
    const record: DeletedSession = {
      id: sessionId,
      title: title.trim().slice(0, 120) || sessionId.slice(0, 8),
      deletedAt: Date.now(),
      projectDir: transcript.projectDir,
      bytes,
    }
    copyFileSync(transcript.file, join(dir, `${sessionId}.jsonl`))
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(record, null, 2), { mode: 0o600 })
    prune()
    return record
  } catch {
    return null
  }
}

export function listDeletedSessions(): DeletedSession[] {
  const dir = backupDir()
  if (!existsSync(dir)) return []
  const out: DeletedSession[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8')) as DeletedSession
      if (!record || !ID_RE.test(record.id)) continue
      if (!existsSync(join(dir, `${record.id}.jsonl`))) continue
      if (!inside(record.projectDir, projectsDir())) continue
      out.push(record)
    } catch {
      // 跳过损坏备份
    }
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** 恢复备份:返回 sessionId;备份不存在/目标冲突/路径越界时返回 null。 */
export function restoreDeletedSession(id: string): string | null {
  if (!ID_RE.test(id)) return null
  const dir = backupDir()
  const metaPath = join(dir, `${id}.json`)
  const dataPath = join(dir, `${id}.jsonl`)
  if (!existsSync(metaPath) || !existsSync(dataPath)) return null
  try {
    const record = JSON.parse(readFileSync(metaPath, 'utf8')) as DeletedSession
    if (!inside(record.projectDir, projectsDir())) return null
    mkdirSync(record.projectDir, { recursive: true })
    const target = join(record.projectDir, `${record.id}.jsonl`)
    if (existsSync(target)) return null
    copyFileSync(dataPath, target)
    rmSync(metaPath, { force: true })
    rmSync(dataPath, { force: true })
    return record.id
  } catch {
    return null
  }
}

/** 测试与诊断用:备份目录(不对外暴露路径) */
export function deletedSessionCount(): number {
  return listDeletedSessions().length
}
