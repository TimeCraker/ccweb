import { describe, expect, it } from 'vitest'
import {
  applyBlockStart,
  applyDelta,
  applyBlockStop,
  reconcileAssistant,
  applyToolResults,
} from './blocks'

describe('render model', () => {
  it('streams text deltas into the open turn', () => {
    let entries = applyBlockStart([], { blockType: 'text', index: 0 })
    entries = applyDelta(entries, { kind: 'text', text: '你好' })
    entries = applyDelta(entries, { kind: 'text', text: ',ccweb' })
    const turn = entries[0]
    expect(turn?.type === 'turn' && turn.blocks[0]).toMatchObject({ kind: 'text', text: '你好,ccweb' })
  })

  it('accumulates tool input by toolUseId and flips to running on stop', () => {
    let entries = applyBlockStart([], { blockType: 'tool_use', index: 0, toolUseId: 'tu_1', toolName: 'Bash' })
    entries = applyDelta(entries, { kind: 'tool_input', text: '{"comm', toolUseId: 'tu_1' })
    entries = applyDelta(entries, { kind: 'tool_input', text: 'and":"ls"}', toolUseId: 'tu_1' })
    entries = applyBlockStop(entries, 0)
    const b = entries[0]?.type === 'turn' ? entries[0].blocks[0] : null
    expect(b).toMatchObject({ kind: 'tool', status: 'running', inputRaw: '{"command":"ls"}' })
  })

  it('reconciles with the full assistant message, preserving tool result state', () => {
    let entries = applyBlockStart([], { blockType: 'tool_use', index: 0, toolUseId: 'tu_1', toolName: 'Bash' })
    entries = applyBlockStop(entries, 0)
    // 工具结果先到
    entries = applyToolResults(entries, {
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'ok', is_error: false }] },
    })
    // 完整 assistant 消息后到:重建但保留 done 状态与结果
    entries = reconcileAssistant(entries, {
      message: { content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }] },
    })
    const b = entries[0]?.type === 'turn' ? entries[0].blocks[0] : null
    expect(b).toMatchObject({ kind: 'tool', toolName: 'Bash', status: 'done', resultText: 'ok', input: { command: 'ls' } })
  })

  it('applies tool_result error flag', () => {
    let entries = applyBlockStart([], { blockType: 'tool_use', index: 0, toolUseId: 'tu_2', toolName: 'Edit' })
    entries = applyToolResults(entries, {
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: 'boom', is_error: true }] },
    })
    const b = entries[0]?.type === 'turn' ? entries[0].blocks[0] : null
    expect(b).toMatchObject({ kind: 'tool', status: 'error' })
  })
})
