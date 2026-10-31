import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

let temporary: string
let module: typeof import('./session-backup.js')
let sessionId: string

beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'ccweb-session-backup-'))
  process.env.CCWEB_HOME = join(temporary, 'app')
  process.env.CLAUDE_CONFIG_DIR = join(temporary, 'claude')
  module = await import('./session-backup.js')
  sessionId = crypto.randomUUID()
  const project = join(temporary, 'claude', 'projects', 'C--demo-project')
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, `${sessionId}.jsonl`), '{"type":"user","message":"hello"}\n')
})

afterAll(() => {
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  rmSync(temporary, { recursive: true, force: true })
})

describe('deleted session backup', () => {
  it('backs up a transcript before deletion and lists it', () => {
    expect(module.listDeletedSessions()).toHaveLength(0)
    const record = module.backupSession(sessionId, '被删除的会话')
    expect(record?.title).toBe('被删除的会话')
    const list = module.listDeletedSessions()
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(sessionId)
    expect(list[0]?.bytes).toBeGreaterThan(0)
    expect(module.deletedSessionCount()).toBe(1)
  })

  it('restores the transcript to the original project directory and removes the backup', () => {
    // 模拟 SDK 已删除原 transcript
    rmSync(join(temporary, 'claude', 'projects', 'C--demo-project', `${sessionId}.jsonl`), { force: true })
    expect(module.restoreDeletedSession(sessionId)).toBe(sessionId)
    const target = join(temporary, 'claude', 'projects', 'C--demo-project', `${sessionId}.jsonl`)
    expect(readFileSync(target, 'utf8')).toContain('hello')
    expect(module.listDeletedSessions()).toHaveLength(0)
    expect(module.restoreDeletedSession(sessionId)).toBeNull()
  })

  it('rejects invalid ids, missing backups and paths outside the projects root', () => {
    expect(module.backupSession('../../evil', 'x')).toBeNull()
    expect(module.restoreDeletedSession('not-a-uuid')).toBeNull()
    const dir = join(temporary, 'app', 'backups', 'sessions')
    mkdirSync(dir, { recursive: true })
    const forged = crypto.randomUUID()
    writeFileSync(join(dir, `${forged}.jsonl`), 'x')
    writeFileSync(
      join(dir, `${forged}.json`),
      JSON.stringify({ id: forged, title: '越界', deletedAt: Date.now(), projectDir: join(temporary, 'outside'), bytes: 1 }),
    )
    expect(module.listDeletedSessions().some((item) => item.id === forged)).toBe(false)
    expect(module.restoreDeletedSession(forged)).toBeNull()
  })
})
