import { useState } from 'react'
import { useAppStore } from '@/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import type { OverviewHost } from './overview-hosts'

export function OverviewProjects({ hosts }: { hosts: OverviewHost[] }): React.JSX.Element {
  const repos = useAppStore((state) => state.repos)
  const folders = useAppStore((state) => state.folderWorkspaces)
  const [query, setQuery] = useState('')
  const matches = (name: string) =>
    name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const shownRepos = repos.filter((repo) => matches(repo.displayName))
  const shownFolders = folders.filter((folder) => !folder.isArchived && matches(folder.name))
  return (
    <section className="space-y-4">
      <Button variant="outline" onClick={() => void useAppStore.getState().addRepo()}>
        {translate('managementOverview.addProject', 'Add project')}
      </Button>
      <Input
        aria-label={translate('managementOverview.searchProjects', 'Search projects and folders')}
        placeholder={translate('managementOverview.searchProjects', 'Search projects and folders')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!shownRepos.length && !shownFolders.length ? (
        <p className="text-sm text-muted-foreground">
          {translate('managementOverview.noProjects', 'No matching projects or folders.')}
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {shownRepos.map((repo) => {
          const host = getRepoExecutionHostId(repo)
          return (
            <div
              key={`${host}:${repo.id}:${repo.path}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{repo.displayName}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {hosts.find((entry) => entry.key === host)?.label ?? host} · {repo.path}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => useAppStore.getState().openProjectHome(repo)}
              >
                {translate('projectHome.title', 'Project home')}
              </Button>
            </div>
          )
        })}
        {shownFolders.map((folder) => {
          const workspace = folderWorkspaceToWorktree(folder)
          return (
            <div
              key={`${workspace.hostId}:${folder.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{folder.name}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {hosts.find((entry) => entry.key === workspace.hostId)?.label ?? workspace.hostId}{' '}
                  · {folder.folderPath}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  activateAndRevealWorkspace(workspace.id, { executionHostId: workspace.hostId })
                }
              >
                {translate('managementOverview.openFolder', 'Open folder')}
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
