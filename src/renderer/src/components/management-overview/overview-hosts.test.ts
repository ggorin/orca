import { describe, expect, it } from 'vitest'
import { overviewHosts } from './overview-hosts'

describe('Overview host inventory', () => {
  it('includes saved but unobserved runtimes without claiming they are connected', () => {
    const hosts = overviewHosts({
      runtimeEnvironments: [
        {
          id: 'host/one',
          name: 'Build server',
          createdAt: 1,
          updatedAt: 1,
          pairingRevision: 2,
          lastUsedAt: null,
          runtimeId: null,
          endpoints: [],
          preferredEndpointId: 'ws'
        }
      ],
      runtimeStatusByEnvironmentId: new Map(),
      sshTargetLabels: new Map([
        ['ssh/one', 'SSH server'],
        ['runtime-ssh-internal', 'Internal tunnel']
      ]),
      sshConnectionStates: new Map()
    })
    expect(hosts.map((host) => [host.key, host.state])).toEqual([
      ['local', 'connected'],
      ['runtime:host%2Fone', 'checking'],
      ['ssh:ssh%2Fone', 'disconnected']
    ])
    expect(hosts[1]?.pairingRevision).toBe(2)
    expect(hosts[2]?.directSsh).toBe(true)
  })
})
