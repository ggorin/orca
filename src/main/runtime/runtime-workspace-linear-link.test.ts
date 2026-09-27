import { describe, expect, it, vi } from 'vitest'
import { linkRuntimeWorkspaceLinearIssue } from './runtime-workspace-linear-link'
import { WorkspaceLinearLinkRequest } from '../../shared/linear/workspace-link-request'
import {
  scanWorkspace,
  scanFolder,
  scanIssue
} from '../../shared/linear/workspace-link-scan.test-fixture'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { ResolvedWorktree } from './runtime-worktree-path-identity'

function fixture() {
  const workspace = scanWorkspace()
  const resolved: ResolvedWorktree = {
    ...workspace,
    parentWorktreeId: null,
    childWorktreeIds: [],
    lineage: null,
    git: workspace
  }
  let meta: WorktreeMeta = workspace
  let folder = scanFolder()
  const store = {
    getWorktreeMetaForHost: vi.fn(() => meta),
    setWorktreeMetaForHost: vi.fn((_id: string, _host: string, updates: Partial<WorktreeMeta>) => {
      meta = { ...meta, ...updates }
      return meta
    }),
    getFolderWorkspaces: () => [folder],
    updateFolderWorkspace: vi.fn((_id: string, updates: Partial<typeof folder>) => {
      folder = { ...folder, ...updates }
      return folder
    }),
    flushPendingOrThrowAsync: vi.fn(async () => {})
  }
  const request = WorkspaceLinearLinkRequest.parse({
    target: { kind: 'worktree', selector: 'identity:wt2:local:instance', instanceId: 'instance' },
    expectedName: workspace.displayName,
    expectedPath: workspace.path,
    expectedBranch: workspace.branch,
    issue: { ...scanIssue(), organizationUrlKey: 'acme' },
    sourceContext: {
      kind: 'task-source',
      provider: 'linear',
      hostId: 'local',
      projectId: 'project',
      providerIdentity: { provider: 'linear', workspaceId: 'org' }
    }
  })
  return {
    workspace,
    store,
    request,
    resolve: vi.fn(async () => resolved),
    notify: vi.fn(),
    setMeta: (updates: Partial<WorktreeMeta>) => {
      meta = { ...meta, ...updates }
    }
  }
}

describe('reviewed workspace link persistence', () => {
  it('writes the owner partition and preserves review metadata', async () => {
    const f = fixture()
    f.setMeta({ linkedPR: 23 })
    await expect(
      linkRuntimeWorkspaceLinearIssue(f.request, f.store, f.resolve, f.notify)
    ).resolves.toEqual({ linked: true })
    expect(f.store.setWorktreeMetaForHost).toHaveBeenCalledWith(
      f.workspace.id,
      'local',
      expect.objectContaining({ linkedLinearIssue: 'ENG-42', linkedLinearIssueWorkspaceId: 'org' })
    )
    expect(f.store.getWorktreeMetaForHost()).toMatchObject({
      linkedPR: 23,
      linkedLinearIssue: 'ENG-42'
    })
    expect(f.store.flushPendingOrThrowAsync).toHaveBeenCalledOnce()
  })
  it('allows only one of two clients to link an initially unlinked workspace', async () => {
    const f = fixture()
    const results = await Promise.allSettled(
      [1, 2].map(() => linkRuntimeWorkspaceLinearIssue(f.request, f.store, f.resolve, f.notify))
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(f.store.setWorktreeMetaForHost).toHaveBeenCalledOnce()
  })
  it('refuses links added while resolving and replaced checkout occupants', async () => {
    const f = fixture()
    f.resolve.mockImplementation(async () => {
      f.setMeta({ linkedGitLabIssue: 12 })
      return {
        ...f.workspace,
        parentWorktreeId: null,
        childWorktreeIds: [],
        lineage: null,
        git: f.workspace
      }
    })
    await expect(
      linkRuntimeWorkspaceLinearIssue(f.request, f.store, f.resolve, f.notify)
    ).rejects.toThrow('preserved')
    expect(f.store.setWorktreeMetaForHost).not.toHaveBeenCalled()
    const replaced = fixture()
    replaced.setMeta({ instanceId: 'replacement' })
    await expect(
      linkRuntimeWorkspaceLinearIssue(
        replaced.request,
        replaced.store,
        replaced.resolve,
        replaced.notify
      )
    ).rejects.toThrow('metadata changed')
  })
  it('links real folder records and refuses a second task', async () => {
    const f = fixture()
    const folder = scanFolder()
    const request: WorkspaceLinearLinkRequest = {
      ...f.request,
      target: { kind: 'folder', id: folder.id, createdAt: folder.createdAt },
      expectedName: folder.name,
      expectedPath: folder.folderPath,
      expectedBranch: ''
    }
    await linkRuntimeWorkspaceLinearIssue(request, f.store, f.resolve, f.notify)
    expect(f.store.updateFolderWorkspace).toHaveBeenCalledWith(
      folder.id,
      expect.objectContaining({
        linkedTask: expect.objectContaining({ provider: 'linear', linearIdentifier: 'ENG-42' })
      })
    )
    expect(f.resolve).not.toHaveBeenCalled()
    await expect(
      linkRuntimeWorkspaceLinearIssue(request, f.store, f.resolve, f.notify)
    ).rejects.toThrow('preserved')
  })
  it('refuses changed folder identity and mismatched Linear organizations', async () => {
    const f = fixture()
    const request: WorkspaceLinearLinkRequest = {
      ...f.request,
      target: { kind: 'folder', id: 'folder', createdAt: 0 }
    }
    await expect(
      linkRuntimeWorkspaceLinearIssue(request, f.store, f.resolve, f.notify)
    ).rejects.toThrow('no longer available')
    expect(
      WorkspaceLinearLinkRequest.safeParse({
        ...f.request,
        issue: { ...f.request.issue, url: 'https://linear.app/other/issue/ENG-42' }
      }).success
    ).toBe(false)
    expect(
      WorkspaceLinearLinkRequest.safeParse({
        ...f.request,
        sourceContext: {
          ...f.request.sourceContext,
          providerIdentity: { provider: 'linear', workspaceId: 'other' }
        }
      }).success
    ).toBe(false)
  })
})
