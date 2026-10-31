import { expect, it } from 'vitest'
import { clientMessageSchema } from './protocol.js'
it('accepts supported image blocks and rejects unsafe MIME types and excessive attachments', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: [image] }).success).toBe(true)
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: ['data:image/svg+xml;base64,AAAA'] }).success).toBe(false)
  expect(clientMessageSchema.safeParse({ t: 'prompt', text: 'image', images: Array(6).fill(image) }).success).toBe(false)
})
