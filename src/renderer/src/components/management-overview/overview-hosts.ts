import { translate } from '@/i18n/i18n'
import { getRuntimeServerConnectionLabel } from '../settings/runtime-environment-host-details'
import { getSshStatusLabel } from '../new-workspace/new-workspace-composer-ssh-status'
import {
  toRuntimeExecutionHostId,
  toSshExecutionHostId,
  isRuntimeOwnedSshTargetId
} from '../../../../shared/execution-host'
import type { AppState } from '@/store/types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { runtimeHostConnectionStateForEntry } from '@/runtime/runtime-host-connection-state'

export type OverviewHost = {
  key: string
  label: string
  state: string
  stateLabel: string
  target: RuntimeClientTarget
  pairingRevision?: number
  directSsh: boolean
}

export function overviewHosts(
  state: Pick<
    AppState,
    | 'runtimeEnvironments'
    | 'runtimeStatusByEnvironmentId'
    | 'sshTargetLabels'
    | 'sshConnectionStates'
  >
): OverviewHost[] {
  return [
    {
      key: 'local',
      label: translate('managementOverview.localHost', 'This computer'),
      state: 'connected',
      stateLabel: getRuntimeServerConnectionLabel('connected'),
      target: { kind: 'local' },
      directSsh: false
    },
    ...state.runtimeEnvironments.map((environment): OverviewHost => ({
      key: toRuntimeExecutionHostId(environment.id),
      label: environment.name,
      state: runtimeHostConnectionStateForEntry(
        state.runtimeStatusByEnvironmentId.get(environment.id)
      ),
      stateLabel: getRuntimeServerConnectionLabel(
        runtimeHostConnectionStateForEntry(state.runtimeStatusByEnvironmentId.get(environment.id))
      ),
      target: { kind: 'environment', environmentId: environment.id },
      pairingRevision: environment.pairingRevision ?? environment.createdAt,
      directSsh: false
    })),
    ...[...state.sshTargetLabels]
      .filter(([id]) => !isRuntimeOwnedSshTargetId(id))
      .map(([id, label]): OverviewHost => ({
        key: toSshExecutionHostId(id),
        label,
        state: state.sshConnectionStates.get(id)?.status ?? 'disconnected',
        stateLabel: getSshStatusLabel(state.sshConnectionStates.get(id)?.status ?? 'disconnected'),
        target: { kind: 'local' },
        directSsh: true
      }))
  ]
}
