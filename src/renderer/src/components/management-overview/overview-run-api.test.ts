import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readOverviewRuns, readOverviewWorkers } from './overview-run-api'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import type { OverviewHost } from './overview-hosts'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))
const host: OverviewHost = {
  key: 'runtime:remote',
  label: 'Remote',
  state: 'connected',
  stateLabel: 'Connected',
  target: { kind: 'environment', environmentId: 'remote' },
  pairingRevision: 1,
  directSsh: false
}
const empty = { runs: [], nextCursor: null }

describe('Overview owner reads', () => {
  beforeEach(() => {
    rpc.mockReset()
    replaceRuntimeEnvironmentRevisions([{ id: 'remote', createdAt: 1 }])
  })
  afterEach(() => vi.useRealTimers())
  it('pins bounded pagination to the selected owner', async () => {
    rpc.mockResolvedValue(empty)
    await expect(readOverviewRuns(host, 'next')).resolves.toEqual(empty)
    expect(rpc).toHaveBeenCalledWith(
      host.target,
      'orchestration.runList',
      { limit: 20, cursor: 'next' },
      expect.objectContaining({ expectedEnvironmentPairingRevision: 1 })
    )
  })
  it('rejects a replaced pairing before and after an in-flight read', async () => {
    rpc.mockImplementation(async () => {
      replaceRuntimeEnvironmentRevisions([{ id: 'remote', createdAt: 2 }])
      return empty
    })
    await expect(readOverviewRuns(host)).rejects.toThrow('pairing changed')
    rpc.mockClear()
    await expect(readOverviewRuns(host)).rejects.toThrow('pairing changed')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('never substitutes local execution for a direct SSH owner', async () => {
    await expect(
      readOverviewRuns({ ...host, target: { kind: 'local' }, directSsh: true })
    ).rejects.toThrow('owning runtime')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves unavailable workers as unverifiable and includes coverage errors', async () => {
    const page = {
      workers: [
        {
          dispatchId: 'dispatch',
          taskId: 'task',
          projection: {
            outcome: 'outcome_unknown',
            liveness: { verdict: 'unverifiable' },
            stage: { worker: null, dispatch: 'start_unknown' },
            resource: { state: 'absent' }
          }
        }
      ],
      page: { nextCursor: null, hasMore: false },
      partialHostErrors: [{ code: 'unavailable' }]
    }
    rpc.mockResolvedValue(page)
    await expect(readOverviewWorkers(host, 'run')).resolves.toEqual(page)
    expect(rpc).toHaveBeenCalledWith(
      host.target,
      'orchestration.workerList',
      { run: 'run', limit: 20, paginate: true, includeRemote: true },
      expect.any(Object)
    )
  })
  it('reports an unsupported old host as an error rather than an empty fleet', async () => {
    rpc.mockRejectedValue(new Error('method_not_found'))
    await expect(readOverviewRuns(host)).rejects.toThrow('method_not_found')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('bounds a stalled local read without inventing an empty result', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue(new Promise(() => {}))
    const result = expect(readOverviewRuns({ ...host, target: { kind: 'local' } })).rejects.toThrow(
      'Coverage is incomplete'
    )
    await vi.advanceTimersByTimeAsync(9000)
    await result
  })
})
