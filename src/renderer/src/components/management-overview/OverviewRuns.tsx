import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { mapWithConcurrency } from '../../../../shared/map-with-concurrency'
import { readOverviewRuns, type OverviewRun } from './overview-run-api'
import type { OverviewHost } from './overview-hosts'
import { OverviewRunDetails } from './OverviewRunDetails'

type HostRuns = {
  host: OverviewHost
  runs: OverviewRun[]
  cursor: string | null
  error: string | null
}
export function OverviewRuns({ hosts }: { hosts: OverviewHost[] }): React.JSX.Element {
  const [pages, setPages] = useState<HostRuns[]>([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<{ host: OverviewHost; run: OverviewRun } | null>(null)
  const alive = useRef(true)
  const locked = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function refresh(): Promise<void> {
    if (locked.current) {
      return
    }
    locked.current = true
    setBusy(true)
    setSelected(null)
    const next = await mapWithConcurrency(
      hosts.filter((host) => !host.directSsh),
      4,
      async (host): Promise<HostRuns> => {
        try {
          if (host.state !== 'connected') {
            throw new Error('Host is unavailable. Run coverage is incomplete.')
          }
          const page = await readOverviewRuns(host)
          return { host, runs: page.runs, cursor: page.nextCursor, error: null }
        } catch (error) {
          return {
            host,
            runs: [],
            cursor: null,
            error: error instanceof Error ? error.message : 'Could not read Runs.'
          }
        }
      }
    )
    if (alive.current) {
      setPages(next)
      setBusy(false)
    }
    locked.current = false
  }
  async function more(page: HostRuns): Promise<void> {
    if (!page.cursor || locked.current) {
      return
    }
    locked.current = true
    setBusy(true)
    try {
      const next = await readOverviewRuns(page.host, page.cursor)
      if (alive.current) {
        setPages((previous) =>
          previous.map((entry) =>
            entry.host.key === page.host.key
              ? {
                  ...entry,
                  runs: [
                    ...new Map([...entry.runs, ...next.runs].map((run) => [run.id, run])).values()
                  ],
                  cursor: next.nextCursor,
                  error: null
                }
              : entry
          )
        )
      }
    } catch (error) {
      if (alive.current) {
        setPages((previous) =>
          previous.map((entry) =>
            entry.host.key === page.host.key
              ? { ...entry, error: error instanceof Error ? error.message : 'Could not read Runs.' }
              : entry
          )
        )
      }
    } finally {
      locked.current = false
      if (alive.current) {
        setBusy(false)
      }
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {translate(
            'managementOverview.runRead',
            'Read Run records from each available runtime. Direct SSH work is managed by its client runtime.'
          )}
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          {busy
            ? translate('managementOverview.reading', 'Reading…')
            : translate('managementOverview.refreshRuns', 'Refresh Runs')}
        </Button>
      </div>
      {pages.map((page) => (
        <section key={page.host.key} className="space-y-3">
          <h2 className="text-sm font-medium">{page.host.label}</h2>
          {page.error ? (
            <p role="alert" className="text-sm text-destructive">
              {page.error}
            </p>
          ) : null}
          {!page.error && !page.runs.length ? (
            <p className="text-sm text-muted-foreground">
              {translate('managementOverview.noRuns', 'No Run records on this host.')}
            </p>
          ) : null}
          {page.runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between gap-3 border-b py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{run.objective}</p>
                <p className="text-xs text-muted-foreground">
                  {run.id} · {run.created_at}
                </p>
              </div>
              <Button variant="outline" onClick={() => setSelected({ host: page.host, run })}>
                {translate('managementOverview.inspect', 'Inspect')}
              </Button>
            </div>
          ))}
          {page.cursor ? (
            <Button variant="outline" disabled={busy} onClick={() => void more(page)}>
              {translate('managementOverview.moreRuns', 'Load more Runs')}
            </Button>
          ) : null}
        </section>
      ))}
      {selected ? (
        <OverviewRunDetails
          key={`${selected.host.key}:${selected.run.id}`}
          host={selected.host}
          run={selected.run}
        />
      ) : null}
    </section>
  )
}
