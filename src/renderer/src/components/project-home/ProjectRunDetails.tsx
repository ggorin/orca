import { useCallback, useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Tasks, Workers, type ProjectRun } from './project-home-api'
import { openProjectCoordinator } from './project-run-navigation'

type Task = z.infer<typeof Tasks>['tasks'][number]
type Worker = z.infer<typeof Workers>['workers'][number]
export function ProjectRunDetails({
  run,
  target
}: {
  run: ProjectRun
  target: RuntimeClientTarget
}) {
  const [scope] = useState({ target, runId: run.id })
  const [tasks, setTasks] = useState<Task[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const locked = useRef(false)
  const load = useCallback(
    async (next?: string) => {
      if (locked.current) {
        return
      }
      locked.current = true
      setBusy(true)
      setError('')
      try {
        const [taskResponse, workerResponse] = await Promise.all([
          next
            ? Promise.resolve(null)
            : callRuntimeRpc(scope.target, 'orchestration.taskList', { run: scope.runId }),
          callRuntimeRpc(scope.target, 'orchestration.workerList', {
            run: scope.runId,
            limit: 20,
            paginate: true,
            includeRemote: true,
            cursor: next
          })
        ])
        const page = Workers.parse(workerResponse)
        const parsedTasks = taskResponse ? Tasks.parse(taskResponse).tasks : null
        if (!alive.current) {
          return
        }
        if (parsedTasks) {
          setTasks(parsedTasks)
        }
        setWorkers((previous) =>
          next
            ? [
                ...previous,
                ...page.workers.filter(
                  (worker) => !previous.some((entry) => entry.dispatchId === worker.dispatchId)
                )
              ]
            : page.workers
        )
        setCursor(page.page.hasMore ? page.page.nextCursor : null)
        setWarning(Boolean(page.partialHostErrors?.length))
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
    void load()
    return () => {
      alive.current = false
    }
  }, [load])
  async function open() {
    if (!run.coordinator_handle) {
      return
    }
    try {
      await openProjectCoordinator(target, run.coordinator_handle)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={translate('projectHome.runDetails', 'Run details')}
    >
      <h3 className="break-words text-sm font-medium">{run.objective}</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!run.coordinator_handle} onClick={() => void open()}>
          {translate('projectHome.openCoordinator', 'Open coordinator')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void load()}>
          {translate('projectHome.refreshDetails', 'Refresh details')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate(
            'projectHome.partial',
            'Some worker hosts are unavailable. These observations may be incomplete.'
          )}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate('projectHome.loading', 'Loading…')}
        </p>
      ) : null}
      <h4 className="text-sm font-medium">{translate('projectHome.tasks', 'Tasks')}</h4>
      {!busy && !error && !tasks.length ? (
        <p className="text-sm text-muted-foreground">
          {translate('projectHome.noTasks', 'No tasks in this run yet.')}
        </p>
      ) : null}
      {tasks.map((task) => (
        <details key={task.id} className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm">
            {task.task_title ?? task.display_name ?? task.id} · {task.status}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{task.spec}</p>
          {task.result ? (
            <pre className="mt-2 max-h-64 overflow-auto scrollbar-sleek whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {task.result}
            </pre>
          ) : null}
        </details>
      ))}
      <h4 className="text-sm font-medium">{translate('projectHome.workers', 'Workers')}</h4>
      {!busy && !error && !workers.length ? (
        <p className="text-sm text-muted-foreground">
          {translate('projectHome.noWorkers', 'No workers in this run yet.')}
        </p>
      ) : null}
      {workers.map((worker) => (
        <div key={worker.dispatchId} className="space-y-1 rounded-md border p-3 text-sm">
          <p className="break-all font-medium">
            {tasks.find((task) => task.id === worker.taskId)?.task_title ?? worker.taskId}
          </p>
          <p className="text-muted-foreground">
            {worker.projection.stage.worker} · {worker.projection.outcome}
          </p>
          <p className="text-muted-foreground">
            {translate('projectHome.liveness', 'Process')}: {worker.projection.liveness.verdict} ·{' '}
            {translate('projectHome.resource', 'Resource')}: {worker.projection.resource.state}
          </p>
        </div>
      ))}
      {cursor ? (
        <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}>
          {translate('projectHome.moreWorkers', 'Load more workers')}
        </Button>
      ) : null}
    </section>
  )
}
