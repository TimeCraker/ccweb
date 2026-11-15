import type { SessionMeta } from './types'

export type Bucket = 'pinned' | 'today' | 'yesterday' | 'week' | 'earlier'

export function bucketOf(iso: string | null, now = new Date()): Bucket {
  if (!iso) return 'earlier'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'earlier'
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const yesterday = new Date(start)
  yesterday.setDate(start.getDate() - 1)
  if (date >= start) return 'today'
  if (date >= yesterday) return 'yesterday'
  if (date >= new Date(start.getTime() - 6 * 86_400_000)) return 'week'
  return 'earlier'
}

/** 稳定排序: 未在 order 里的新会话按最新时间置顶在最前，今天活跃的会话永远在历史非活跃会话前，杜绝新会话沉底 */
export function applySessionOrder(
  sessions: SessionMeta[],
  order: string[],
  now = new Date(),
): SessionMeta[] {
  if (order.length === 0) return sessions
  const pos = new Map(order.map((id, i) => [id, i]))
  const known = sessions.filter((s) => pos.has(s.id))
  if (known.length === 0) return sessions
  const rest = sessions.filter((s) => !pos.has(s.id))
  known.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
  // 新产生或未排过序的会话保持时间倒序排在最上方，确保最新活跃会话第一时间可见
  const combined = [...rest, ...known]
  // 防御旧 order 缓存绑架: 今天活跃的会话必须排在非今天的不活跃旧会话前面
  return combined.sort((a, b) => {
    const aToday = bucketOf(a.lastModified, now) === 'today'
    const bToday = bucketOf(b.lastModified, now) === 'today'
    if (aToday && !bToday) return -1
    if (!aToday && bToday) return 1
    return 0 // 同属今天或同属非今天时，严格保持既定相对顺序
  })
}

/** 将置顶会话固定在最前，其余会话保持既有排序 */
export function applyPinnedOrder(
  sessions: SessionMeta[],
  pinnedIds: Set<string> | readonly string[] | string[],
): SessionMeta[] {
  const pinSet = pinnedIds instanceof Set ? pinnedIds : new Set(pinnedIds)
  return [
    ...sessions.filter((s) => pinSet.has(s.id)),
    ...sessions.filter((s) => !pinSet.has(s.id)),
  ]
}
