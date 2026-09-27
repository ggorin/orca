import type { AppState } from '@/store/types'
import type { Worktree } from '../../../shared/worktree/types'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../shared/folder-workspace-worktree'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import {
  callRuntimeRpc,
  getActiveRuntimeTarget,
  type RuntimeClientTarget
} from '@/runtime/runtime-rpc-client'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { runtimeHostConnectionStateForEntry } from '@/runtime/runtime-host-connection-state'
import { settingsForKnownRepoOwner } from '@/store/slices/worktrees/listing/worktree-owner-settings'
import { listDetectedWorktreesForRepoCoalesced } from '@/store/slices/worktrees/listing/detected-worktree-refresh'
import { getCurrentDirectSshAuthority } from '@/store/slices/worktrees/listing/direct-ssh-authority'

export type LinearScanWorkspace = {
  key: string
  worktree: Worktree
  project: string
  hostLabel: string
  target: RuntimeClientTarget
  pairingRevision?: number
  folder?: FolderWorkspace
  repoPath?: string
  repoOwnerExecutionHostId?: string
}

export function scanTargetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : target.environmentId
}

export async function collectLinearScanWorkspaces(
  state: Pick<
    AppState,
    | 'repos'
    | 'settings'
    | 'runtimeEnvironments'
    | 'runtimeStatusByEnvironmentId'
    | 'projectGroups'
    | 'sshConnectionStates'
  >,
  assertCurrent: () => void,
  progress: (label: string) => void
): Promise<{ workspaces: LinearScanWorkspace[]; warnings: string[] }> {
  const workspaces: LinearScanWorkspace[] = []
  const warnings: string[] = []
  const targets = new Map<string, RuntimeClientTarget>([['local', { kind: 'local' }]])
  for (const environment of state.runtimeEnvironments) {
    targets.set(environment.id, { kind: 'environment', environmentId: environment.id })
  }
  const targetAvailable = (target: RuntimeClientTarget): boolean =>
    target.kind === 'local' ||
    runtimeHostConnectionStateForEntry(
      state.runtimeStatusByEnvironmentId.get(target.environmentId)
    ) === 'connected'
  for (const repo of state.repos) {
    assertCurrent()
    const hostId = getRepoExecutionHostId(repo)
    const settings = settingsForKnownRepoOwner(state.settings, repo)
    const target = getActiveRuntimeTarget(settings)
    const pairingRevision =
      target.kind === 'environment'
        ? getRuntimeEnvironmentRevision(target.environmentId)
        : undefined
    const hostLabel = `${repo.displayName} · ${hostId}`
    progress(hostLabel)
    try {
      if (!targetAvailable(target)) {
        throw new Error('Host is not connected.')
      }
      const directSshAuthority =
        target.kind === 'local' && parseExecutionHostId(hostId)?.kind === 'ssh'
          ? getCurrentDirectSshAuthority(state, hostId)
          : undefined
      if (directSshAuthority === null) {
        throw new Error('SSH host is not connected.')
      }
      const refresh = await listDetectedWorktreesForRepoCoalesced(settings, repo.id, {
        executionHostId: hostId,
        directSshAuthority,
        connectionId: repo.connectionId
      })
      assertCurrent()
      if (refresh.status !== 'admitted' || !refresh.result.authoritative) {
        throw new Error('Workspace inventory is unavailable.')
      }
      for (const worktree of refresh.result.worktrees) {
        if (!worktree.isArchived && !worktree.isBare) {
          workspaces.push({
            key: JSON.stringify([
              scanTargetKey(target),
              worktree.identity?.key ?? hostId,
              worktree.id
            ]),
            worktree,
            project: repo.displayName,
            hostLabel,
            target,
            pairingRevision,
            repoPath: repo.path,
            repoOwnerExecutionHostId: hostId
          })
        }
      }
    } catch (error) {
      assertCurrent()
      warnings.push(
        `${hostLabel}: ${error instanceof Error ? error.message : 'Could not read workspaces.'}`
      )
    }
  }
  for (const target of targets.values()) {
    assertCurrent()
    const key = scanTargetKey(target)
    const pairingRevision =
      target.kind === 'environment'
        ? getRuntimeEnvironmentRevision(target.environmentId)
        : undefined
    try {
      if (!targetAvailable(target)) {
        throw new Error('Host is not connected.')
      }
      const result = await callRuntimeRpc<{ folderWorkspaces: FolderWorkspace[] }>(
        target,
        'folderWorkspace.list',
        undefined,
        {
          timeoutMs: 15_000,
          expectedEnvironmentPairingRevision: pairingRevision
        }
      )
      assertCurrent()
      for (const folder of result.folderWorkspaces) {
        if (folder.isArchived) {
          continue
        }
        const worktree = folderWorkspaceToWorktree(folder)
        if (
          target.kind === 'local' &&
          folder.connectionId &&
          !getCurrentDirectSshAuthority(state, worktree.hostId ?? 'local')
        ) {
          warnings.push(`${folder.name}: SSH host is not connected.`)
          continue
        }
        workspaces.push({
          key: JSON.stringify([key, worktree.id]),
          worktree,
          project:
            state.projectGroups.find((group) => group.id === folder.projectGroupId)?.name ??
            'Folder workspace',
          hostLabel: `${key} · ${worktree.hostId ?? 'local'}`,
          target,
          pairingRevision,
          folder
        })
      }
    } catch (error) {
      assertCurrent()
      warnings.push(
        `${key}: ${error instanceof Error ? error.message : 'Could not read folder workspaces.'}`
      )
    }
  }
  return { workspaces: [...new Map(workspaces.map((item) => [item.key, item])).values()], warnings }
}
