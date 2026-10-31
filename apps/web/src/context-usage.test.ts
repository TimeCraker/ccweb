import { expect, it } from 'vitest'
import { contextUsage } from './context-usage'
it('shares zero, over-limit and unavailable native context semantics', () => {
  expect(contextUsage({ totalTokens: 0, rawMaxTokens: 100 })).toEqual({ used: 0, max: 100, percentage: 0 })
  expect(contextUsage({ usage: { totalTokens: 120, rawMaxTokens: 100, percentage: 50 } })?.percentage).toBe(120)
  expect(contextUsage({ totalTokens: 5, rawMaxTokens: 0 })).toBeNull()
  expect(contextUsage({ totalTokens: NaN, rawMaxTokens: 100 })).toBeNull()
  expect(contextUsage(null)).toBeNull()
})
