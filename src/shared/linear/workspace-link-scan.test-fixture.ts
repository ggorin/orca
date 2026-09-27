import type { Worktree } from '../worktree/types'
import type { LinearIssue } from './issue-types'
import type { FolderWorkspace } from '../folder-workspace-types'

export function scanWorkspace(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/repo/topic',
    repoId: 'repo',
    path: '/repo/topic',
    head: 'abc',
    branch: 'refs/heads/eng-42-fix',
    displayName: 'ENG-42 fix',
    hostId: 'local',
    instanceId: 'instance',
    identity: { key: 'wt2:local:instance', executionHostId: 'local', instanceId: 'instance' },
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

export function scanIssue(
  identifier = 'ENG-42',
  overrides: Partial<LinearIssue> = {}
): LinearIssue {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: 'org',
    identifier,
    title: 'Fix the issue',
    url: `https://linear.app/acme/issue/${identifier}`,
    state: { name: 'Todo', type: 'unstarted', color: '' },
    team: { id: 'team', name: 'Engineering', key: 'ENG' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: '',
    ...overrides
  }
}

export function scanFolder(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder',
    projectGroupId: 'group',
    name: 'ENG-42 folder',
    folderPath: '/folder',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}
