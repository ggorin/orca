import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { readOverviewWorkers, type OverviewRun, type OverviewWorkerPage } from './overview-run-api'
import type { OverviewHost } from './overview-hosts'

export function OverviewRunDetails({
  host,
  run
}: {
  host: OverviewHost
  run: OverviewRun
}): React.JSX.Element {
  const [request, setRequest] = useState<{ cursor: string | undefined; revision: number }>({
    cursor: undefined,
    revision: 0
  })
  const [workers, setWorkers] = useState<OverviewWorkerPage['workers']>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError('')
    void readOverviewWorkers(host, run.id, request.cursor)
      .then((page) => {
        if (cancelled) {
          return
        }
        setWorkers((previous) =>
          request.cursor
            ? [
                ...new Map(
                  [...previous, ...page.workers].map((worker) => [worker.dispatchId, worker])
                ).values()
              ]
            : page.workers
        )
        setPartial(
          (previous) =>
            Boolean(page.partialHostErrors?.length) || (Boolean(request.cursor) && previous)
        )
        setCursor(page.page.hasMore ? page.page.nextCursor : null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not read workers.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [host, run.id, request])
  return (
    <section
      aria-label={translate('managementOverview.runDetails', 'Run details')}
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="break-words text-sm font-medium">{run.objective}</h3>
      <p className="text-xs text-muted-foreground">
        {host.label} · {run.id}
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => setRequest({ cursor: undefined, revision: request.revision + 1 })}
      >
        {translate('managementOverview.refreshDetails', 'Refresh details')}
      </Button>
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate('managementOverview.reading', 'Reading…')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {partial ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate(
            'managementOverview.partialWorkers',
            'Some worker hosts are unavailable. These observations are incomplete.'
          )}
        </p>
      ) : null}
      {!busy && !error && !partial && !workers.length ? (
        <p className="text-sm text-muted-foreground">
          {translate('managementOverview.noWorkers', 'No workers recorded for this Run.')}
        </p>
      ) : null}
      {workers.map((worker) => (
        <div key={worker.dispatchId} className="space-y-1 border-b py-3 text-sm">
          <p className="break-all font-medium">{worker.taskId}</p>
          <p className="text-muted-foreground">
            {worker.projection.stage.worker ?? worker.projection.stage.dispatch} ·{' '}
            {worker.projection.outcome}
          </p>
          <p className="text-muted-foreground">
            {translate('managementOverview.process', 'Process')}:{' '}
            {worker.projection.liveness.verdict} ·{' '}
            {translate('managementOverview.resource', 'Resource')}:{' '}
            {worker.projection.resource.state}
          </p>
        </div>
      ))}
      {cursor ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setRequest({ cursor, revision: request.revision + 1 })}
        >
          {translate('managementOverview.moreWorkers', 'Load more workers')}
        </Button>
      ) : null}
    </section>
  )
}
