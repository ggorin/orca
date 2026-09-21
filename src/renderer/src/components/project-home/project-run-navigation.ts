import { z } from 'zod'
import { useAppStore } from '@/store'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { parseExecutionHostId } from '../../../../shared/execution-host'

export async function openProjectCoordinator(
  target: RuntimeClientTarget,
  handle: string
): Promise<void> {
  const { terminal } = z
    .object({
      terminal: z.object({
        handle: z.string(),
        worktreeId: z.string(),
        tabId: z.string(),
        leafId: z.string(),
        executionHostId: z.string().optional()
      })
    })
    .parse(await callRuntimeRpc(target, 'terminal.show', { terminal: handle }))
  if (terminal.handle !== handle) {
    throw new Error('Coordinator identity changed. Refresh the run history.')
  }
  const state = useAppStore.getState()
  const hostId =
    target.kind === 'environment'
      ? `runtime:${encodeURIComponent(target.environmentId)}`
      : (terminal.executionHostId ?? 'local')
  const host = parseExecutionHostId(hostId)
  if (
    !host ||
    !state.getKnownWorktreeById(terminal.worktreeId, host.id) ||
    getRuntimeEnvironmentIdForWorktree(state, terminal.worktreeId) !==
      (target.kind === 'environment' ? target.environmentId : null) ||
    !state.tabsByWorktree[terminal.worktreeId]?.some((tab) => tab.id === terminal.tabId)
  ) {
    throw new Error(
      'This coordinator tab is not available in this client. Open the owning workspace and refresh.'
    )
  }
  state.setActiveWorktree(terminal.worktreeId, host.id)
  state.setActiveTab(terminal.tabId)
  state.setActiveTabType('terminal')
  state.setActiveView('terminal')
  focusTerminalTabSurface(terminal.tabId, terminal.leafId)
}
