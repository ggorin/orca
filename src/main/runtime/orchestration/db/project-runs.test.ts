import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './orchestration-db'
import { migrateV42 } from './schema/migrate-v42'
let db: OrchestrationDb

afterEach(() => db?.close())
describe('repository run history', () => {
  it('paginates one repository without including other or historical unscoped runs', () => {
    db = new OrchestrationDb(':memory:')
    const create = (pane: string, repoId?: string) =>
      db.createRun({
        objective: pane,
        coordinatorHandle: pane,
        coordinatorPaneKey: pane,
        repoId,
        worktreeId: `${pane}-workspace`
      })
    create('legacy')
    create('other', 'r2')
    const first = create('first', 'r1')
    const second = create('second', 'r1')
    const page = db.listRuns({ repoIds: ['r1'], limit: 1 })
    expect(page.runs).toHaveLength(1)
    expect(page.nextCursor).toBeTruthy()
    const next = db.listRuns({ repoIds: ['r1'], limit: 1, cursor: page.nextCursor! })
    expect(new Set([...page.runs, ...next.runs].map((run) => run.id))).toEqual(
      new Set([first.id, second.id])
    )
    expect(next.nextCursor).toBeNull()
    expect(page.runs[0]?.repo_id).toBe('r1')
    expect(db.listRuns({ repoIds: [] }).runs).toEqual([])
    expect(db.listRuns({ repoIds: ["r1') OR 1=1 --"] }).runs).toEqual([])
    expect(db.listRuns().runs).toHaveLength(5)
  })
  it('upgrades a v41 runs table without attributing old runs to a project', () => {
    db = new OrchestrationDb(':memory:')
    const old = db.createRun({
      objective: 'old',
      coordinatorHandle: 'old',
      coordinatorPaneKey: 'old'
    })
    db.db.exec(
      'DROP INDEX idx_runs_repo_created; ALTER TABLE runs DROP COLUMN repo_id; ALTER TABLE runs DROP COLUMN worktree_id'
    )
    migrateV42.call(db, 41)
    expect(db.getRun(old.id)).toMatchObject({ repo_id: null, worktree_id: null })
    expect(db.listRuns({ repoIds: ['r1'] }).runs).toEqual([])
    migrateV42.call(db, 41)
    expect(db.getRun(old.id)?.objective).toBe('old')
  })
})
