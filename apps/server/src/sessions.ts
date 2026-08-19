import { listSessions, getSessionMessages, renameSession, deleteSession } from '@anthropic-ai/claude-agent-sdk'
import type { SessionMeta } from './protocol.js'

/**
 * 会话查询桥:listSessions / getSessionMessages(SDK 官方 API,底层读
 * ~/.claude/projects/<encoded-cwd>/*.jsonl——server 重启后天然恢复)。
 * SDK 版本差异(无此 API 的旧版)降级为空列表,UI 显示占位。
 */

interface SdkSessionInfoLike {
  /** SDK 0.3.x 实际字段为驼峰 sessionId / 数字时间戳(实测 2026-08-19) */
  sessionId?: string
  id?: string
  session_id?: string
  summary?: string
  customTitle?: string
  firstPrompt?: string
  lastModified?: number | string
  gitBranch?: string
}

function toIso(v: number | string | undefined): string | null {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v).toISOString()
  return v
}

async function tryCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

export async function listSessionMetas(cwd?: string): Promise<SessionMeta[]> {
  const raw = await tryCall<SdkSessionInfoLike[]>(
    () => (listSessions as unknown as (o?: { dir?: string }) => Promise<SdkSessionInfoLike[]>)(
      cwd ? { dir: cwd } : undefined,
    ),
    [],
  )
  return raw
    .map((s) => ({
      id: s.sessionId ?? s.id ?? s.session_id ?? '',
      title: s.customTitle ?? s.summary ?? s.firstPrompt ?? '(无标题)',
      lastModified: toIso(s.lastModified),
      gitBranch: s.gitBranch ?? null,
    }))
    .filter((s) => s.id !== '')
    .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))
}

export async function fetchHistory(sessionId: string, cwd?: string): Promise<unknown[]> {
  const msgs = await tryCall<unknown[]>(
    () =>
      (
        getSessionMessages as unknown as (
          id: string,
          o?: { dir?: string; limit?: number },
        ) => Promise<unknown[]>
      )(sessionId, { ...(cwd ? { dir: cwd } : {}), limit: 200 }),
    [],
  )
  return msgs
}

export async function renameSessionMeta(sessionId: string, title: string): Promise<boolean> {
  try {
    await (renameSession as unknown as (id: string, title: string, opts?: unknown) => Promise<unknown>)(
      sessionId,
      title,
    )
    return true
  } catch {
    return false
  }
}

export async function deleteSessionMeta(sessionId: string): Promise<boolean> {
  try {
    await (deleteSession as unknown as (id: string, opts?: unknown) => Promise<unknown>)(sessionId)
    return true
  } catch {
    return false
  }
}

export function isSessionApiAvailable(): boolean {
  return typeof listSessions === 'function' && typeof getSessionMessages === 'function'
}
