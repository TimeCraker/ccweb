import { describe, expect, it } from 'vitest'
import { applyPinnedOrder, applySessionOrder, bucketOf } from './session-order'
import type { SessionMeta } from './types'

function makeSession(id: string, lastModified: string | null = null, title = id): SessionMeta {
  return {
    id,
    title,
    lastModified,
    gitBranch: null,
  }
}

describe('bucketOf', () => {
  const baseTime = new Date('2026-11-15T12:00:00.000Z')

  it('classifies null, undefined, or invalid ISO string as earlier', () => {
    expect(bucketOf(null, baseTime)).toBe('earlier')
    expect(bucketOf('', baseTime)).toBe('earlier')
    expect(bucketOf('invalid-date', baseTime)).toBe('earlier')
  })

  it('classifies timestamps within today as today', () => {
    // Same day at 08:00
    expect(bucketOf('2026-11-15T08:00:00.000Z', baseTime)).toBe('today')
    // Start of today
    expect(bucketOf('2026-11-15T00:00:00.000Z', baseTime)).toBe('today')
  })

  it('classifies timestamps from yesterday as yesterday', () => {
    // Yesterday afternoon
    expect(bucketOf('2026-11-14T15:00:00.000Z', baseTime)).toBe('yesterday')
    // Yesterday morning
    expect(bucketOf('2026-11-14T01:00:00.000Z', baseTime)).toBe('yesterday')
  })

  it('classifies timestamps from 2 to 6 days ago as week', () => {
    // 3 days ago
    expect(bucketOf('2026-11-12T12:00:00.000Z', baseTime)).toBe('week')
    // 6 days ago
    expect(bucketOf('2026-11-09T12:00:00.000Z', baseTime)).toBe('week')
  })

  it('classifies older timestamps as earlier', () => {
    // 8 days ago
    expect(bucketOf('2026-11-07T12:00:00.000Z', baseTime)).toBe('earlier')
    // Last month
    expect(bucketOf('2026-10-01T12:00:00.000Z', baseTime)).toBe('earlier')
  })
})

describe('applySessionOrder', () => {
  const today = '2026-11-15T10:00:00.000Z'
  const yesterday = '2026-11-14T10:00:00.000Z'
  const older = '2026-10-01T10:00:00.000Z'
  const refTime = new Date('2026-11-15T12:00:00.000Z')

  describe('custom order reordering', () => {
    it('reorders sessions strictly according to custom order IDs', () => {
      const s1 = makeSession('s1', today)
      const s2 = makeSession('s2', today)
      const s3 = makeSession('s3', today)
      const sessions = [s1, s2, s3]

      const result = applySessionOrder(sessions, ['s3', 's1', 's2'], refTime)
      expect(result.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
    })

    it('reorders sessions with inverted order', () => {
      const s1 = makeSession('s1', today)
      const s2 = makeSession('s2', today)
      const s3 = makeSession('s3', today)
      const sessions = [s1, s2, s3]

      const result = applySessionOrder(sessions, ['s3', 's2', 's1'], refTime)
      expect(result.map((s) => s.id)).toEqual(['s3', 's2', 's1'])
    })
  })

  describe('unranked session handling and preservation', () => {
    it('preserves sessions not present in order array at the top of today bucket', () => {
      const s1 = makeSession('s1', today)
      const s2 = makeSession('s2', today)
      const sNew = makeSession('sNew', today) // newly created, not in order
      const sessions = [sNew, s1, s2]

      const result = applySessionOrder(sessions, ['s2', 's1'], refTime)
      // sNew was not in order, so it stays on top among today sessions
      expect(result.map((s) => s.id)).toEqual(['sNew', 's2', 's1'])
    })

    it('preserves unranked older sessions without dropping them', () => {
      const s1 = makeSession('s1', yesterday)
      const s2 = makeSession('s2', yesterday)
      const sOld = makeSession('sOld', older)
      const sessions = [sOld, s1, s2]

      const result = applySessionOrder(sessions, ['s2', 's1'], refTime)
      // All are non-today, so sOld remains preserved at top of combined list
      expect(result.map((s) => s.id)).toEqual(['sOld', 's2', 's1'])
    })

    it('prioritizes today active sessions over unranked older sessions', () => {
      const sTodayRanked = makeSession('sToday', today)
      const sOldUnranked = makeSession('sOldUnranked', older)
      const sessions = [sOldUnranked, sTodayRanked]

      // Even if sOldUnranked is unranked and was at head of sessions,
      // defensive sorting ensures today active session comes first
      const result = applySessionOrder(sessions, ['sToday'], refTime)
      expect(result.map((s) => s.id)).toEqual(['sToday', 'sOldUnranked'])
    })

    it('prioritizes today ranked sessions over ranked older sessions even if old is ordered first', () => {
      const sToday = makeSession('sToday', today)
      const sOld = makeSession('sOld', older)
      const sessions = [sToday, sOld]

      // Stale order cache might have old session before today session
      const result = applySessionOrder(sessions, ['sOld', 'sToday'], refTime)
      expect(result.map((s) => s.id)).toEqual(['sToday', 'sOld'])
    })
  })

  describe('graceful fallbacks and edge cases', () => {
    it('returns original sessions array when order is empty', () => {
      const sessions = [makeSession('s1'), makeSession('s2')]
      const result = applySessionOrder(sessions, [], refTime)
      expect(result).toBe(sessions)
    })

    it('returns empty array when sessions list is empty', () => {
      const result = applySessionOrder([], ['s1', 's2'], refTime)
      expect(result).toEqual([])
    })

    it('returns original sessions when order contains only non-existent IDs', () => {
      const sessions = [makeSession('s1'), makeSession('s2')]
      const result = applySessionOrder(sessions, ['ghost-1', 'ghost-2'], refTime)
      expect(result).toBe(sessions)
    })

    it('gracefully ignores non-existent IDs mixed with valid IDs', () => {
      const s1 = makeSession('s1', today)
      const s2 = makeSession('s2', today)
      const sessions = [s1, s2]

      const result = applySessionOrder(sessions, ['ghost', 's2', 'unknown', 's1'], refTime)
      expect(result.map((s) => s.id)).toEqual(['s2', 's1'])
    })

    it('handles duplicate IDs in order array without duplicating sessions', () => {
      const s1 = makeSession('s1', today)
      const s2 = makeSession('s2', today)
      const sessions = [s1, s2]

      const result = applySessionOrder(sessions, ['s2', 's2', 's1', 's1'], refTime)
      expect(result.map((s) => s.id)).toEqual(['s2', 's1'])
    })
  })
})

describe('applyPinnedOrder', () => {
  it('moves pinned sessions to the beginning while keeping relative order', () => {
    const s1 = makeSession('s1')
    const s2 = makeSession('s2')
    const s3 = makeSession('s3')
    const s4 = makeSession('s4')
    const sessions = [s1, s2, s3, s4]

    const result = applyPinnedOrder(sessions, new Set(['s3', 's1']))
    expect(result.map((s) => s.id)).toEqual(['s1', 's3', 's2', 's4'])
  })

  it('accepts array of pinned IDs as well as Set', () => {
    const s1 = makeSession('s1')
    const s2 = makeSession('s2')
    const s3 = makeSession('s3')
    const sessions = [s1, s2, s3]

    const result = applyPinnedOrder(sessions, ['s2'])
    expect(result.map((s) => s.id)).toEqual(['s2', 's1', 's3'])
  })

  it('leaves sessions unchanged if no pinned IDs match', () => {
    const sessions = [makeSession('s1'), makeSession('s2')]
    const result = applyPinnedOrder(sessions, new Set(['ghost']))
    expect(result.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('leaves sessions unchanged if pinned set is empty', () => {
    const sessions = [makeSession('s1'), makeSession('s2')]
    const result = applyPinnedOrder(sessions, new Set())
    expect(result.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('correctly composes with applySessionOrder', () => {
    const today = '2026-11-15T10:00:00.000Z'
    const refTime = new Date('2026-11-15T12:00:00.000Z')

    const s1 = makeSession('s1', today)
    const s2 = makeSession('s2', today)
    const s3 = makeSession('s3', today)
    const s4 = makeSession('s4', today)
    const sessions = [s1, s2, s3, s4]

    // First custom order: s4, s3, s2, s1
    const ordered = applySessionOrder(sessions, ['s4', 's3', 's2', 's1'], refTime)
    expect(ordered.map((s) => s.id)).toEqual(['s4', 's3', 's2', 's1'])

    // Then pin s2: s2 moves to front, remaining [s4, s3, s1] maintain custom order
    const withPins = applyPinnedOrder(ordered, new Set(['s2']))
    expect(withPins.map((s) => s.id)).toEqual(['s2', 's4', 's3', 's1'])
  })
})
