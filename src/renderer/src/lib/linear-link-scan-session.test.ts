import type * as RuntimeRpcClient from '@/runtime/runtime-rpc-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { scanIssue, scanWorkspace } from '../../../shared/linear/workspace-link-scan.test-fixture'
import { createLinearLinkScanSession } from './linear-link-scan-session'
import type { LinearScanWorkspace } from './linear-link-scan-inventory'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  status: vi.fn(),
  issue: vi.fn(),
  rpc: vi.fn(),
  inventory: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: mocks.state } }))
vi.mock('@/runtime/runtime-linear-client', () => ({ linearStatus: mocks.status }))
vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({ linearGetIssue: mocks.issue }))
vi.mock('./linear-link-scan-inventory', () => ({ collectLinearScanWorkspaces: mocks.inventory }))
vi.mock('@/runtime/runtime-rpc-client', async (original) => ({
  ...(await original<typeof RuntimeRpcClient>()),
  callRuntimeRpc: mocks.rpc
}))

const account = {
  id: 'org',
  organizationId: 'org',
  organizationName: 'Acme',
  organizationUrlKey: 'acme',
  displayName: 'User',
  email: null
}
const source: TaskSourceContext = {
  kind: 'task-source',
  provider: 'linear',
  projectId: 'project',
  hostId: 'local'
}
const entry: LinearScanWorkspace = {
  key: 'remote',
  worktree: scanWorkspace({ linkedPR: 12 }),
  project: 'Project',
  hostLabel: 'Remote',
  target: { kind: 'environment', environmentId: 'remote' },
  pairingRevision: 2,
  repoPath: '/repo',
  repoOwnerExecutionHostId: 'runtime:remote'
}
function state() {
  return {
    activeOrcaProfileId: 'profile',
    settings: null,
    linearStatus: { connected: true, viewer: account, workspaces: [account] },
    runtimeEnvironments: [
      {
        id: 'remote',
        name: 'Remote',
        createdAt: 1,
        updatedAt: 1,
        pairingRevision: 2,
        lastUsedAt: null,
        runtimeId: 'runtime',
        endpoints: [],
        preferredEndpointId: 'endpoint'
      }
    ],
    sshConnectionStates: new Map(),
    fetchHostedReviewForBranch: vi.fn(),
    fetchAllWorktrees: vi.fn(),
    fetchFolderWorkspaces: vi.fn()
  } satisfies Pick<
    AppState,
    | 'activeOrcaProfileId'
    | 'settings'
    | 'linearStatus'
    | 'runtimeEnvironments'
    | 'sshConnectionStates'
    | 'fetchHostedReviewForBranch'
    | 'fetchAllWorktrees'
    | 'fetchFolderWorkspaces'
  >
}
beforeEach(() => {
  vi.resetAllMocks()
  const current = state()
  mocks.state.mockReturnValue(current)
  mocks.status.mockResolvedValue(current.linearStatus)
  mocks.issue.mockResolvedValue(scanIssue())
  mocks.inventory.mockResolvedValue({ workspaces: [entry], warnings: [] })
})
function session() {
  return createLinearLinkScanSession(account, source, new AbortController().signal)
}

describe('scan session apply boundaries', () => {
  it('stops before reading inventory when the saved credential is unusable', async () => {
    mocks.status.mockResolvedValue({
      ...mocks.state().linearStatus,
      credentialError: 'Reconnect Linear'
    })
    await expect(session().scan(() => {})).rejects.toThrow('Reconnect Linear')
    expect(mocks.inventory).not.toHaveBeenCalled()
  })
  it('reads review titles from the repository owner and saves only on that runtime', async () => {
    const current = mocks.state()
    current.fetchHostedReviewForBranch.mockResolvedValue({ title: 'ENG-42 fix' })
    const scan = session()
    await scan.scan(() => {})
    expect(current.fetchHostedReviewForBranch).toHaveBeenCalledWith(
      '/repo',
      'eng-42-fix',
      expect.objectContaining({ repoOwnerExecutionHostId: 'runtime:remote' })
    )
    await scan.link(entry, scanIssue())
    expect(mocks.issue).toHaveBeenLastCalledWith(source, scanIssue().id, 'org')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      entry.target,
      'workspace.linkLinearIssue',
      expect.objectContaining({
        target: {
          kind: 'worktree',
          selector: 'identity:wt2:local:instance',
          instanceId: 'instance'
        }
      }),
      { timeoutMs: 15000, expectedEnvironmentPairingRevision: 2 }
    )
  })

  it('refuses a re-paired host after the issue lookup', async () => {
    const scan = session()
    mocks.issue.mockImplementation(async () => {
      mocks.state().runtimeEnvironments[0].pairingRevision = 3
      return scanIssue()
    })
    await expect(scan.link(entry, scanIssue())).rejects.toThrow('context changed')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses changed provider identity', async () => {
    const scan = session()
    mocks.issue.mockResolvedValue(scanIssue('ENG-42', { workspaceId: 'other' }))
    await expect(scan.link(entry, scanIssue())).rejects.toThrow('Issue moved')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('invalidates a proposal when direct SSH authority changes', async () => {
    const scan = session()
    mocks.state().sshConnectionStates.set('target', {
      status: 'connected',
      providerEpoch: 'new',
      connectionGeneration: 2
    })
    await expect(scan.link(entry, scanIssue())).rejects.toThrow('context changed')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('asks to update an old owning runtime without falling back to local writes', async () => {
    mocks.rpc.mockRejectedValue(
      new RuntimeRpcCallError({
        id: 'link',
        ok: false,
        error: { code: 'method_not_found', message: 'Unknown method' },
        _meta: { runtimeId: 'old' }
      })
    )
    await expect(session().link(entry, scanIssue())).rejects.toThrow('Update the owning runtime')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toEqual(entry.target)
  })
})
