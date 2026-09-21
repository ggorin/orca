import type { ProjectCoordination, ProjectUpdateArgs } from './project-types'
import { ProjectUpdate } from './rpc-contract/project-runtime-params'

export function applyProjectCoordinationUpdate(
  current: ProjectCoordination | undefined,
  update: NonNullable<ProjectUpdateArgs['updates']['coordination']>
): ProjectCoordination {
  const parsed = ProjectUpdate.shape.updates.shape.coordination.unwrap().parse(update)
  if (parsed.expectedRevision !== (current?.revision ?? 0)) {
    throw new Error('Project instructions changed. Reload before saving your changes.')
  }
  return {
    goal: parsed.goal,
    instructions: parsed.instructions,
    revision: parsed.expectedRevision + 1
  }
}
