import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useLiveDashboardSnapshot } from '../dashboard/useLiveDashboardSnapshot'
import { revealDashboardAgent } from '../dashboard/reveal-dashboard-agent'
import { AgentKanbanBoard } from '../dashboard-popout/AgentKanbanBoard'
import { overviewHosts } from './overview-hosts'
import { OverviewProjects } from './OverviewProjects'
import { OverviewRuns } from './OverviewRuns'

function OverviewAgents(): React.JSX.Element {
  const snapshot = useLiveDashboardSnapshot()
  return (
    <AgentKanbanBoard
      snapshot={snapshot}
      containerClassName="h-full w-full"
      onAckAgent={(key) => useAppStore.getState().acknowledgeAgents([key])}
      onRevealAgent={revealDashboardAgent}
    />
  )
}

export default function ManagementOverviewPage(): React.JSX.Element {
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const statuses = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const sshLabels = useAppStore((state) => state.sshTargetLabels)
  const sshStates = useAppStore((state) => state.sshConnectionStates)
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const switching = useAppStore((state) => state.orcaProfileSwitching)
  const hosts = overviewHosts({
    runtimeEnvironments: environments,
    runtimeStatusByEnvironmentId: statuses,
    sshTargetLabels: sshLabels,
    sshConnectionStates: sshStates
  })
  const scope = JSON.stringify([
    profile,
    hosts.map((host) => [host.key, host.pairingRevision, host.state])
  ])
  if (isWebClientLocation()) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {translate(
          'managementOverview.desktop',
          'Open Overview in the desktop app to see all connected hosts.'
        )}
      </p>
    )
  }
  if (switching) {
    return (
      <p role="status" className="p-6 text-sm">
        {translate('managementOverview.switching', 'Switching profile…')}
      </p>
    )
  }
  return (
    <div className="h-full overflow-auto scrollbar-sleek">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-3">
          <h1 className="text-xl font-semibold">
            {translate('managementOverview.title', 'Overview')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate(
              'managementOverview.description',
              'Projects and execution across your connected hosts. Plan and triage work in Linear.'
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => useAppStore.getState().openTaskPage({ taskSource: 'linear' })}>
              {translate('managementOverview.linear', 'Open Linear work')}
            </Button>
            <Button variant="outline" onClick={() => useAppStore.getState().openAutomationsPage()}>
              {translate('managementOverview.automations', 'Automations')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                useAppStore.getState().openSettingsTarget({ pane: 'stats', repoId: null })
              }
            >
              {translate('managementOverview.usage', 'Usage')}
            </Button>
          </div>
        </header>
        {hosts.some((host) => host.state !== 'connected') ? (
          <p role="status" className="text-sm text-muted-foreground">
            {translate(
              'managementOverview.incomplete',
              'Some hosts are unavailable. Projects and agent activity may be incomplete; check Hosts for connection status.'
            )}
          </p>
        ) : null}
        <Tabs defaultValue="projects">
          <TabsList variant="line">
            <TabsTrigger value="projects">
              {translate('managementOverview.projects', 'Projects')}
            </TabsTrigger>
            <TabsTrigger value="agents">
              {translate('managementOverview.agents', 'Agents')}
            </TabsTrigger>
            <TabsTrigger value="runs">{translate('managementOverview.runs', 'Runs')}</TabsTrigger>
            <TabsTrigger value="hosts">
              {translate('managementOverview.hosts', 'Hosts')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="projects">
            <OverviewProjects hosts={hosts} />
          </TabsContent>
          <TabsContent value="agents">
            <OverviewAgents />
          </TabsContent>
          <TabsContent value="runs">
            <OverviewRuns key={scope} hosts={hosts} />
          </TabsContent>
          <TabsContent value="hosts">
            <div className="divide-y divide-border">
              {hosts.map((host) => (
                <div key={host.key} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{host.label}</p>
                    <p className="text-xs text-muted-foreground">{host.stateLabel}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="my-3 text-sm text-muted-foreground">
              {translate(
                'managementOverview.coverage',
                'Unavailable hosts may still have running work. Their current execution state is unverifiable.'
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  useAppStore.getState().openSettingsTarget({ pane: 'servers', repoId: null })
                }
              >
                {translate('managementOverview.manageHosts', 'Manage servers')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  useAppStore.getState().openSettingsTarget({ pane: 'ssh', repoId: null })
                }
              >
                {translate('managementOverview.manageSsh', 'Manage SSH connections')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
