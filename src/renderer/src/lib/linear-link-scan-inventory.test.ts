import type * as RuntimeRpcClient from '@/runtime/runtime-rpc-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectLinearScanWorkspaces } from './linear-link-scan-inventory'
import { scanFolder, scanWorkspace } from '../../../shared/linear/workspace-link-scan.test-fixture'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'

const mocks = vi.hoisted(() => ({ list: vi.fn(), rpc: vi.fn() }))
vi.mock('@/store/slices/worktrees/listing/detected-worktree-refresh', () => ({
  listDetectedWorktreesForRepoCoalesced: mocks.list
}))
vi.mock('@/runtime/runtime-rpc-client', async (original) => ({
  ...(await original<typeof RuntimeRpcClient>()),
  callRuntimeRpc: mocks.rpc
}))

function inventory(): Parameters<typeof collectLinearScanWorkspaces>[0] {
  const status = createCompatibleRuntimeStatusResponse()
  if (!status.ok) {
    throw new Error('Missing fixture status')
  }
  return {
    settings: null,
    repos: [
      {
        id: 'repo',
        displayName: 'Remote',
        path: '/repo',
        badgeColor: '',
        addedAt: 1,
        executionHostId: 'runtime:remote'
      }
    ],
    projectGroups: [],
    sshConnectionStates: new Map(),
    runtimeEnvironments: [
      {
        id: 'remote',
        name: 'Remote',
        createdAt: 1,
        updatedAt: 1,
        pairingRevision: 2,
        lastUsedAt: null,
        runtimeId: 'remote-runtime',
        endpoints: [],
        preferredEndpointId: 'endpoint'
      }
    ],
    runtimeStatusByEnvironmentId: new Map([['remote', { status: status.result, checkedAt: 1 }]])
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  replaceRuntimeEnvironmentRevisions([{ id: 'remote', createdAt: 1, pairingRevision: 2 }])
  mocks.list.mockResolvedValue({
    status: 'admitted',
    result: { authoritative: true, worktrees: [scanWorkspace()] }
  })
  mocks.rpc.mockResolvedValue({ folderWorkspaces: [] })
})

describe('scan inventory host ownership', () => {
  it('retains the catalog owner when remote workspaces carry host-native identities', async () => {
    mocks.rpc.mockImplementation(async (target) => ({
      folderWorkspaces: target.kind === 'environment' ? [scanFolder()] : []
    }))
    const result = await collectLinearScanWorkspaces(
      inventory(),
      () => {},
      () => {}
    )
    expect(result.warnings).toEqual([])
    expect(result.workspaces).toHaveLength(2)
    expect(result.workspaces[0]).toMatchObject({
      repoOwnerExecutionHostId: 'runtime:remote',
      target: { kind: 'environment', environmentId: 'remote' },
      pairingRevision: 2,
      worktree: { hostId: 'local' }
    })
    expect(result.workspaces[1]).toMatchObject({
      target: { kind: 'environment', environmentId: 'remote' },
      pairingRevision: 2,
      folder: { id: 'folder' }
    })
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ activeRuntimeEnvironmentId: 'remote' }),
      'repo',
      expect.objectContaining({ executionHostId: 'runtime:remote' })
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'remote' },
      'folderWorkspace.list',
      undefined,
      expect.objectContaining({ expectedEnvironmentPairingRevision: 2 })
    )
  })

  it('reports an unavailable host without listing its work locally', async () => {
    const state = inventory()
    state.runtimeStatusByEnvironmentId.set('remote', { status: null, checkedAt: 2 })
    const result = await collectLinearScanWorkspaces(
      state,
      () => {},
      () => {}
    )
    expect(result.workspaces).toEqual([])
    expect(result.warnings).toHaveLength(2)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toEqual({ kind: 'local' })
  })

  it('refuses non-authoritative inventory and disconnected direct SSH', async () => {
    const state = inventory()
    mocks.list.mockResolvedValue({
      status: 'admitted',
      result: { authoritative: false, worktrees: [scanWorkspace()] }
    })
    state.repos = [
      ...state.repos,
      {
        ...state.repos[0],
        id: 'ssh',
        executionHostId: 'ssh:target',
        connectionId: 'target'
      }
    ]
    const result = await collectLinearScanWorkspaces(
      state,
      () => {},
      () => {}
    )
    expect(result.workspaces).toEqual([])
    expect(result.warnings).toHaveLength(2)
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })
})
