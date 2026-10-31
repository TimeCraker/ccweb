import { expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: native.spawn }))
import { assertNoNativeBackground, trackSdkProcess } from './runtime.js'
it('ignores owned SDK processes but refuses unowned native writers and released PIDs', () => {
  const release = trackSdkProcess(1234)
  native.spawn.mockReturnValue({ status: 0, stdout: JSON.stringify([{ pid: 1234, kind: 'interactive', status: 'idle' }]) })
  expect(() => assertNoNativeBackground({})).not.toThrow()
  native.spawn.mockReturnValue({ status: 0, stdout: JSON.stringify([{ pid: 1234 }, { pid: 5678, kind: 'background', status: 'running' }]) })
  expect(() => assertNoNativeBackground({})).toThrow('未由 ccweb 持有')
  release()
  native.spawn.mockReturnValue({ status: 0, stdout: JSON.stringify([{ pid: 1234 }]) })
  expect(() => assertNoNativeBackground({})).toThrow('未由 ccweb 持有')
  native.spawn.mockReturnValue({ status: 0, stdout: '{}' })
  expect(() => assertNoNativeBackground({})).toThrow('格式不可识别')
})
