import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  loadProject,
  loadRuns,
  projectHomeTarget,
  type ProjectContext,
  type ProjectRun
} from './project-home-api'
import { ProjectContextEditor } from './ProjectContextEditor'
import { ProjectCoordinatorLauncher } from './ProjectCoordinatorLauncher'
import { ProjectRunDetails } from './ProjectRunDetails'

function ProjectHome({
  repo,
  target,
  draftKey
}: {
  repo: Repo
  target: RuntimeClientTarget
  draftKey: string
}) {
  const draft = useAppStore((state) => state.projectHomeDrafts[draftKey])
  const [scope] = useState({ target, repoId: repo.id })
  const contextRef = useRef<ProjectContext | null>(null)
  const [project, setProject] = useState<ProjectContext | null>(null)
  const [runs, setRuns] = useState<ProjectRun[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<ProjectRun | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const locked = useRef(false)
  const refresh = useCallback(
    async (next?: string) => {
      if (locked.current) {
        return
      }
      locked.current = true
      setBusy(true)
      setError('')
      try {
        const [context, page] = await Promise.all([
          contextRef.current
            ? Promise.resolve(contextRef.current)
            : loadProject(scope.target, scope.repoId),
          loadRuns(scope.target, scope.repoId, next)
        ])
        if (!alive.current) {
          return
        }
        if (!contextRef.current) {
          contextRef.current = context
          setProject(context)
        }
        setRuns((previous) =>
          next
            ? [
                ...previous,
                ...page.runs.filter((run) => !previous.some((entry) => entry.id === run.id))
              ]
            : page.runs
        )
        setCursor(page.nextCursor)
      } catch (cause) {
        if (alive.current) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        locked.current = false
        if (alive.current) {
          setBusy(false)
        }
      }
    },
    [scope]
  )
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [refresh])
  const selected = runs.find((run) => run.id === selectedRun?.id) ?? selectedRun
  const dirty = Boolean(
    draft &&
    (draft.goal !== (project?.coordination?.goal ?? '') ||
      draft.instructions !== (project?.coordination?.instructions ?? ''))
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{repo.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {translate('projectHome.title', 'Project home')} · {getRepoExecutionHostId(repo)}
          </p>
        </div>
        <Button variant="outline" onClick={() => useAppStore.getState().setActiveView('terminal')}>
          {translate('projectHome.back', 'Back to workspace')}
        </Button>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate('projectHome.loading', 'Loading…')}
        </p>
      ) : null}
      {!project ? (
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          {translate('projectHome.retry', 'Retry')}
        </Button>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <ProjectContextEditor
              project={project}
              target={target}
              repoId={repo.id}
              draftKey={draftKey}
              onSaved={(saved) => {
                contextRef.current = saved
                setProject(saved)
              }}
            />
            <ProjectCoordinatorLauncher
              repo={repo}
              target={target}
              dirty={dirty}
              goal={project.coordination?.goal ?? ''}
              instructions={project.coordination?.instructions ?? ''}
            />
          </div>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">
                {translate('projectHome.runs', 'Run history')}
              </h2>
              <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
                {translate('projectHome.refresh', 'Refresh runs')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {translate(
                'projectHome.historyHelp',
                'Runs created for this repository on this runtime appear here. Older runs without a repository association are not included.'
              )}
            </p>
            {!runs.length && !busy && !error ? (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'projectHome.noRuns',
                  'No runs yet. Send the coordinator draft to begin.'
                )}
              </p>
            ) : null}
            {runs.map((run) => (
              <Button
                key={run.id}
                variant={selectedRun?.id === run.id ? 'secondary' : 'outline'}
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => setSelectedRun(run)}
              >
                {run.objective} · {new Date(run.created_at).toLocaleString()}
              </Button>
            ))}
            {cursor ? (
              <Button variant="outline" disabled={busy} onClick={() => void refresh(cursor)}>
                {translate('projectHome.moreRuns', 'Load more runs')}
              </Button>
            ) : null}
          </section>
          {selected ? <ProjectRunDetails key={selected.id} run={selected} target={target} /> : null}
        </>
      )}
    </div>
  )
}

export default function ProjectHomePage() {
  const selectedRepo = useAppStore((state) => state.projectHomeRepo)
  const repos = useAppStore((state) => state.repos)
  const setups = useAppStore((state) => state.projectHostSetups)
  const repo = repos.find(
    (entry) =>
      selectedRepo &&
      entry.id === selectedRepo.id &&
      getRepoExecutionHostId(entry) === getRepoExecutionHostId(selectedRepo)
  )
  if (!repo) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">
          {translate('projectHome.choose', 'Choose a project')}
        </h1>
        {repos.map((entry) => (
          <Button
            key={`${getRepoExecutionHostId(entry)}:${entry.id}`}
            variant="outline"
            onClick={() => useAppStore.getState().openProjectHome(entry)}
          >
            {entry.displayName}
          </Button>
        ))}
      </div>
    )
  }
  let target: RuntimeClientTarget
  try {
    target = projectHomeTarget(repo, setups)
  } catch (cause) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {cause instanceof Error ? cause.message : String(cause)}
      </p>
    )
  }
  const key = `${target.kind === 'environment' ? target.environmentId : 'local'}:${getRepoExecutionHostId(repo)}:${repo.id}`
  return (
    <div className="h-full overflow-auto scrollbar-sleek">
      <ProjectHome key={key} draftKey={key} repo={repo} target={target} />
    </div>
  )
}
