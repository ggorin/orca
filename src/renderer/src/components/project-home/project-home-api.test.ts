import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_COORDINATION_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { Repo } from '../../../../shared/repo-types'
import type { ProjectHostSetup } from '../../../../shared/project-types'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))
vi.mock('@/store/projects/project-host-routing', () => ({
  getProjectSetupRuntimeTarget: (host: string) =>
    host.startsWith('runtime:')
      ? { kind: 'environment', environmentId: host.slice(8) }
      : { kind: 'local' }
}))
import { loadProject, loadRuns, projectHomeTarget, saveProject } from './project-home-api'
const target = { kind: 'environment', environmentId: 'server' } as const
beforeEach(() => rpc.mockReset())
describe('Project home runtime boundaries', () => {
  it('refuses old hosts before issuing a filter they would discard', async () => {
    rpc.mockResolvedValue({ runtimeId: 'server-runtime', capabilities: [] })
    await expect(loadRuns(target, 'r1')).rejects.toThrow('Update Orca')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('scopes and paginates on the selected runtime', async () => {
    rpc
      .mockResolvedValueOnce({
        runtimeId: 'server-runtime',
        capabilities: [PROJECT_COORDINATION_RUNTIME_CAPABILITY]
      })
      .mockResolvedValueOnce({ runs: [], nextCursor: null })
    await expect(loadRuns(target, 'r1', 'cursor')).resolves.toEqual({ runs: [], nextCursor: null })
    expect(rpc).toHaveBeenLastCalledWith(
      target,
      'orchestration.runList',
      { repoIds: ['r1'], limit: 20, cursor: 'cursor' },
      expect.objectContaining({ expectedEnvironmentRuntimeId: 'server-runtime' })
    )
  })
  it('rejects an out-of-scope run even from a host advertising support', async () => {
    rpc
      .mockResolvedValueOnce({
        runtimeId: 'server-runtime',
        capabilities: [PROJECT_COORDINATION_RUNTIME_CAPABILITY]
      })
      .mockResolvedValueOnce({
        runs: [
          {
            id: 'run',
            repo_id: 'r2',
            worktree_id: null,
            coordinator_handle: null,
            objective: 'x',
            created_at: ''
          }
        ],
        nextCursor: null
      })
    await expect(loadRuns(target, 'r1')).rejects.toThrow('outside')
  })
  it('loads context from its owning runtime and carries the exact revision on save', async () => {
    const project = {
      id: 'p',
      displayName: 'P',
      sourceRepoIds: ['r1'],
      coordination: { goal: 'old', instructions: '', revision: 5 }
    }
    rpc
      .mockResolvedValueOnce({
        runtimeId: 'server-runtime',
        capabilities: [PROJECT_COORDINATION_RUNTIME_CAPABILITY]
      })
      .mockResolvedValueOnce({ projects: [project] })
    expect(await loadProject(target, 'r1')).toEqual(project)
    rpc
      .mockResolvedValueOnce({
        runtimeId: 'server-runtime',
        capabilities: [PROJECT_COORDINATION_RUNTIME_CAPABILITY]
      })
      .mockRejectedValueOnce(new Error('conflict'))
    await expect(saveProject(target, project, 'new', '')).rejects.toThrow('conflict')
    expect(rpc).toHaveBeenLastCalledWith(
      target,
      'project.update',
      {
        projectId: 'p',
        updates: { coordination: { goal: 'new', instructions: '', expectedRevision: 5 } }
      },
      expect.objectContaining({ expectedEnvironmentRuntimeId: 'server-runtime' })
    )
  })
  it('routes a nested SSH setup through its paired runtime owner', () => {
    const repo: Repo = {
      id: 'r1',
      path: '/repo',
      displayName: 'P',
      badgeColor: '',
      addedAt: 1,
      executionHostId: 'ssh:remote'
    }
    const setup: ProjectHostSetup = {
      id: 's',
      projectId: 'p',
      repoId: 'r1',
      path: '/repo',
      displayName: 'P',
      hostId: 'runtime:server',
      executionHostId: 'ssh:remote',
      runtimeOwnerEnvironmentId: 'server',
      setupState: 'ready',
      setupMethod: 'legacy-repo',
      createdAt: 1,
      updatedAt: 1
    }
    expect(projectHomeTarget(repo, [setup])).toEqual(target)
    expect(() =>
      projectHomeTarget(repo, [setup, { ...setup, runtimeOwnerEnvironmentId: 'other' }])
    ).toThrow('multiple')
  })
})
