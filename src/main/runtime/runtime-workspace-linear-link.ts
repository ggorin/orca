import type { WorkspaceLinearLinkRequest } from '../../shared/linear/workspace-link-request'
import { hasWorkspaceIssueLink } from '../../shared/linear/workspace-link-scan'
import { folderWorkspaceToWorktree } from '../../shared/folder-workspace-worktree'
import type { WorkspaceLinkedItem } from '../../shared/worktree/types'
import type { RuntimeStore } from './runtime-store-contract'
import type { ResolvedWorktree } from './runtime-worktree-path-identity'

export async function linkRuntimeWorkspaceLinearIssue(
  request: WorkspaceLinearLinkRequest,
  store: Pick<
    RuntimeStore,
    | 'getFolderWorkspaces'
    | 'updateFolderWorkspace'
    | 'getWorktreeMetaForHost'
    | 'setWorktreeMetaForHost'
    | 'flushPendingOrThrowAsync'
  >,
  resolve: (selector: string) => Promise<ResolvedWorktree>,
  notify: (repoId?: string) => void
): Promise<{ linked: true }> {
  const linkedWorkItem: WorkspaceLinkedItem = {
    provider: 'linear',
    type: 'issue',
    number: 0,
    title: request.issue.title,
    url: request.issue.url,
    linearIdentifier: request.issue.identifier
  }
  const assertSnapshot = (current: {
    displayName: string
    path: string
    branch: string
    isArchived: boolean
  }): void => {
    if (
      current.isArchived ||
      current.displayName !== request.expectedName ||
      current.path !== request.expectedPath ||
      current.branch !== request.expectedBranch
    ) {
      throw new Error('Workspace changed. Scan again before linking.')
    }
  }
  if (request.target.kind === 'folder') {
    const target = request.target
    const folder = store.getFolderWorkspaces?.().find((entry) => entry.id === target.id)
    if (!folder || folder.createdAt !== target.createdAt || !store.updateFolderWorkspace) {
      throw new Error('Folder workspace is no longer available.')
    }
    const current = folderWorkspaceToWorktree(folder)
    assertSnapshot(current)
    if (folder.linkedTask) {
      throw new Error('This workspace already has a linked task. Its link was preserved.')
    }
    store.updateFolderWorkspace(folder.id, {
      linkedTask: linkedWorkItem,
      linkedTaskSourceContext: request.sourceContext
    })
    notify()
  } else {
    const current = await resolve(request.target.selector)
    if (current.instanceId !== request.target.instanceId) {
      throw new Error('Workspace was replaced. Scan again before linking.')
    }
    const host = current.identity?.executionHostId ?? current.hostId
    if (!host || !store.getWorktreeMetaForHost || !store.setWorktreeMetaForHost) {
      throw new Error('Workspace owner is unavailable. Update the owning runtime.')
    }
    // Read and write without an await so another client cannot replace an existing link.
    const meta = store.getWorktreeMetaForHost(current.id, host)
    if (!meta || meta.instanceId !== request.target.instanceId) {
      throw new Error('Workspace metadata changed. Scan again before linking.')
    }
    assertSnapshot({
      ...current,
      ...(meta?.displayName ? { displayName: meta.displayName } : {}),
      isArchived: meta?.isArchived ?? current.isArchived
    })
    if (hasWorkspaceIssueLink(current) || hasWorkspaceIssueLink(meta ?? {})) {
      throw new Error('This workspace already has a linked issue. Its link was preserved.')
    }
    store.setWorktreeMetaForHost(current.id, host, {
      linkedLinearIssue: request.issue.identifier,
      linkedLinearIssueWorkspaceId: request.issue.workspaceId,
      linkedLinearIssueOrganizationUrlKey: request.issue.organizationUrlKey,
      linkedWorkItem,
      linkedTaskSourceContext: request.sourceContext
    })
    notify(current.repoId)
  }
  await store.flushPendingOrThrowAsync?.()
  return { linked: true }
}
