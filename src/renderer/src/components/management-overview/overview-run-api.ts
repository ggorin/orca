import { z } from 'zod'
import { withTimeout } from '../../../../shared/promise-timeout-fallback'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import type { OverviewHost } from './overview-hosts'

export const OverviewRun = z.object({
  id: z.string(),
  objective: z.string(),
  created_at: z.string(),
  coordinator_handle: z.string().nullable()
})
export type OverviewRun = z.infer<typeof OverviewRun>
const RunPage = z.object({ runs: z.array(OverviewRun), nextCursor: z.string().nullable() })
const WorkerPage = z.object({
  workers: z.array(
    z.object({
      dispatchId: z.string(),
      taskId: z.string(),
      projection: z.object({
        outcome: z.string(),
        liveness: z.object({ verdict: z.enum(['live', 'unverifiable', 'exited']) }),
        stage: z.object({ worker: z.string().nullable(), dispatch: z.string() }),
        resource: z.object({ state: z.string() })
      })
    })
  ),
  page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  partialHostErrors: z.array(z.unknown()).optional()
})
export type OverviewWorkerPage = z.infer<typeof WorkerPage>
export function assertOverviewHostCurrent(host: OverviewHost): void {
  if (host.directSsh) {
    throw new Error('Read SSH work through its owning runtime.')
  }
  if (
    host.target.kind === 'environment' &&
    getRuntimeEnvironmentRevision(host.target.environmentId) !== host.pairingRevision
  ) {
    throw new Error('Host pairing changed. Refresh Overview.')
  }
}
export async function readOverviewRuns(host: OverviewHost, cursor?: string) {
  assertOverviewHostCurrent(host)
  const result = RunPage.parse(
    await boundedRead(
      callRuntimeRpc(
        host.target,
        'orchestration.runList',
        { limit: 20, ...(cursor ? { cursor } : {}) },
        { timeoutMs: 5000, expectedEnvironmentPairingRevision: host.pairingRevision }
      ),
      9000
    )
  )
  assertOverviewHostCurrent(host)
  return result
}

export async function readOverviewWorkers(host: OverviewHost, runId: string, cursor?: string) {
  assertOverviewHostCurrent(host)
  const result = WorkerPage.parse(
    await boundedRead(
      callRuntimeRpc(
        host.target,
        'orchestration.workerList',
        {
          run: runId,
          limit: 20,
          paginate: true,
          includeRemote: true,
          ...(cursor ? { cursor } : {})
        },
        { timeoutMs: 8000, expectedEnvironmentPairingRevision: host.pairingRevision }
      ),
      9000
    )
  )
  assertOverviewHostCurrent(host)
  return result
}

async function boundedRead(promise: Promise<unknown>, timeoutMs: number): Promise<unknown> {
  type Result = { value: unknown } | { error: unknown } | { timeout: true }
  const result = await withTimeout<Result>(
    promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    ),
    timeoutMs,
    { timeout: true }
  )
  if ('timeout' in result) {
    throw new Error('Host did not respond. Coverage is incomplete.')
  }
  if ('error' in result) {
    throw result.error
  }
  return result.value
}
