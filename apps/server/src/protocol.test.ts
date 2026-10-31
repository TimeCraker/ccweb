import { expect, it } from 'vitest'
import { clientMessageSchema } from './protocol.js'
it('accepts supported image blocks and rejects unsafe MIME types and excessive attachments', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: [image] }).success).toBe(true)
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: ['data:image/svg+xml;base64,AAAA'] }).success).toBe(false)
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: Array(6).fill(image) }).success).toBe(false)
})
it('accepts settings scopes and rejects unknown scopes', () => {
  expect(clientMessageSchema.safeParse({ t: 'settings.patch', patch: { model: 'x' } }).success).toBe(true)
  for (const scope of ['session', 'default', 'both']) {
    expect(clientMessageSchema.safeParse({ t: 'settings.patch', scope, patch: { model: 'x' } }).success).toBe(true)
  }
  expect(clientMessageSchema.safeParse({ t: 'settings.patch', scope: 'everyone', patch: { model: 'x' } }).success).toBe(false)
})
