import type { OrchestrationDb } from '../orchestration-db'

export function migrateV42(this: OrchestrationDb, current: number): void {
  if (current >= 42) {
    return
  }
  for (const column of ['repo_id', 'worktree_id']) {
    if (!this.hasColumn('runs', column)) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN ${column} TEXT`)
    }
  }
  this.db.exec(
    'CREATE INDEX IF NOT EXISTS idx_runs_repo_created ON runs(repo_id, created_at DESC, id DESC)'
  )
}
