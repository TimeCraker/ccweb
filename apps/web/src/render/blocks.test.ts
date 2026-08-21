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

  it('multi-step turn: later text-only assistant message appends instead of wiping tool blocks', () => {
    // 第一步:assistant 消息带 tool_use(id=A)
    let entries = reconcileAssistant([], {
      message: { id: 'msg_A', content: [{ type: 'tool_use', id: 'tu_1', name: 'Grep', input: { pattern: 'x' } }] },
    })
    // 工具结果回填
    entries = applyToolResults(entries, {
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'hit', is_error: false }] },
    })
    // 第二步:同 turn 的后续纯文本 assistant 消息(id=B)——不能把工具块抹掉
    entries = reconcileAssistant(entries, {
      message: { id: 'msg_B', content: [{ type: 'text', text: '命中 sample.txt' }] },
    })
    const turn = entries[0]
    if (!turn || turn.type !== 'turn') throw new Error('turn missing')
    expect(turn.blocks).toHaveLength(2)
    expect(turn.blocks[0]).toMatchObject({ kind: 'tool', toolName: 'Grep', status: 'done', resultText: 'hit' })
    expect(turn.blocks[1]).toMatchObject({ kind: 'text', text: '命中 sample.txt' })
  })

  it('same assistant message re-arrival rebuilds in place (streaming reconcile)', () => {
    let entries = reconcileAssistant([], {
      message: { id: 'msg_A', content: [{ type: 'text', text: 'v1' }] },
    })
    entries = reconcileAssistant(entries, {
      message: { id: 'msg_A', content: [{ type: 'text', text: 'v1 完整版' }] },
    })
    const turn = entries[0]
    expect(turn?.type === 'turn' && turn.blocks).toHaveLength(1)
    expect(turn?.type === 'turn' && turn.blocks[0]).toMatchObject({ kind: 'text', text: 'v1 完整版' })
  })

  it('block stop does not regress a done tool block (cross-message index collision)', () => {
    // turn: [tool(done), text(streaming)];msg2 的 stop(index 0)不得把 tool 打回 running
    let entries = reconcileAssistant([], {
      message: { id: 'msg_A', content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }] },
    })
    entries = applyToolResults(entries, {
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'ok', is_error: false }] },
    })
    entries = applyBlockStart(entries, { blockType: 'text', index: 0 })
    entries = applyBlockStop(entries, 0) // msg2 的 text stop,index 0 撞上 tool
    const turn = entries[0]
    expect(turn?.type === 'turn' && turn.blocks[0]).toMatchObject({ kind: 'tool', status: 'done' })
  })
})
