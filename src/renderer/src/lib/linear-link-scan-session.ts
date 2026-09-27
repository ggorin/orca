import { useAppStore } from '@/store'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { LinearWorkspace } from '../../../shared/linear/workspace-types'
import { linearWorkspaceScopeSignature } from '../../../shared/linear/workspace-types'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import { linearStatus } from '@/runtime/runtime-linear-client'
import { getProviderRuntimeContextKey } from './provider-runtime-context'
import { collectLinearScanWorkspaces, type LinearScanWorkspace } from './linear-link-scan-inventory'
import { scanLinearWorkspaceLinks, isVerifiedScanIssue } from './linear-link-scan'
import { callRuntimeRpc, RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
import { WorkspaceLinearLinkRequest } from '../../../shared/linear/workspace-link-request'
import type { LinearIssue } from '../../../shared/linear/issue-types'

function contextSignature(): string {
  const state = useAppStore.getState()
  return JSON.stringify([
    state.activeOrcaProfileId,
    getProviderRuntimeContextKey(state.settings),
    linearWorkspaceScopeSignature(state.linearStatus),
    [...state.sshConnectionStates].map(([id, connection]) => [
      id,
      connection.status,
      connection.providerEpoch,
      connection.connectionGeneration
    ]),
    state.runtimeEnvironments.map((environment) => [
      environment.id,
      environment.pairingRevision ?? environment.createdAt
    ])
  ])
}

export function createLinearLinkScanSession(
  account: LinearWorkspace,
  sourceContext: TaskSourceContext,
  signal: AbortSignal
) {
  const signature = contextSignature()
  const assertCurrent = (): void => {
    if (signal.aborted || signature !== contextSignature()) {
      throw new Error('Scan context changed. Scan again before linking.')
    }
  }
  const verifyConnection = async (): Promise<void> => {
    assertCurrent()
    const status = await linearStatus(sourceContext)
    assertCurrent()
    if (!status.connected || status.credentialError) {
      throw new Error(status.credentialError || 'Connect Linear before scanning workspaces.')
    }
    if (
      linearWorkspaceScopeSignature(status) !==
      linearWorkspaceScopeSignature(useAppStore.getState().linearStatus)
    ) {
      throw new Error('Linear connection changed. Refresh and scan again.')
    }
  }
  return {
    assertCurrent,
    async scan(progress: (label: string) => void) {
      await verifyConnection()
      const state = useAppStore.getState()
      const inventory = await collectLinearScanWorkspaces(state, assertCurrent, progress)
      const result = await scanLinearWorkspaceLinks({
        workspaces: inventory.workspaces,
        account,
        assertCurrent,
        progress,
        readIssue: (identifier) => linearGetIssue(sourceContext, identifier, account.id),
        readReviewTitle: async (entry) => {
          const workspace = entry.worktree
          if (
            !entry.repoPath ||
            !workspace.branch ||
            !(
              workspace.linkedPR ||
              workspace.linkedGitLabMR ||
              workspace.linkedBitbucketPR ||
              workspace.linkedAzureDevOpsPR ||
              workspace.linkedGiteaPR
            )
          ) {
            return undefined
          }
          const review = await state.fetchHostedReviewForBranch(
            entry.repoPath,
            workspace.branch.replace(/^refs\/heads\//, ''),
            {
              repoId: workspace.repoId,
              repoOwnerExecutionHostId: entry.repoOwnerExecutionHostId,
              linkedGitHubPR: workspace.linkedPR,
              linkedGitLabMR: workspace.linkedGitLabMR,
              linkedBitbucketPR: workspace.linkedBitbucketPR,
              linkedAzureDevOpsPR: workspace.linkedAzureDevOpsPR,
              linkedGiteaPR: workspace.linkedGiteaPR
            }
          )
          if (!review) {
            throw new Error('Review unavailable')
          }
          return review.title
        }
      })
      await verifyConnection()
      return { ...result, warnings: [...inventory.warnings, ...result.warnings] }
    },
    async link(entry: LinearScanWorkspace, issue: LinearIssue): Promise<void> {
      await verifyConnection()
      const current = await linearGetIssue(sourceContext, issue.id, account.id)
      await verifyConnection()
      assertCurrent()
      if (
        !current ||
        current.id !== issue.id ||
        !isVerifiedScanIssue(current, account, issue.identifier)
      ) {
        throw new Error('Issue moved or access changed. Scan again before linking.')
      }
      const workspace = entry.worktree
      if (!entry.folder && !workspace.identity?.key) {
        throw new Error('Update the owning runtime to link this workspace safely.')
      }
      const request = WorkspaceLinearLinkRequest.parse({
        target: entry.folder
          ? { kind: 'folder', id: entry.folder.id, createdAt: entry.folder.createdAt }
          : {
              kind: 'worktree',
              selector: `identity:${workspace.identity?.key ?? ''}`,
              instanceId: workspace.instanceId
            },
        expectedName: workspace.displayName,
        expectedPath: workspace.path,
        expectedBranch: workspace.branch,
        sourceContext: {
          ...sourceContext,
          providerIdentity: { provider: 'linear', workspaceId: account.id }
        },
        issue: {
          id: current.id,
          identifier: current.identifier,
          title: current.title,
          url: current.url,
          workspaceId: account.id,
          organizationUrlKey: account.organizationUrlKey
        }
      })
      assertCurrent()
      try {
        await callRuntimeRpc(entry.target, 'workspace.linkLinearIssue', request, {
          timeoutMs: 15_000,
          expectedEnvironmentPairingRevision: entry.pairingRevision
        })
      } catch (error) {
        if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
          throw new Error('Update the owning runtime to link this workspace safely.')
        }
        throw error
      }
      assertCurrent()
      void useAppStore.getState().fetchAllWorktrees()
      void useAppStore.getState().fetchFolderWorkspaces()
    }
  }
}
