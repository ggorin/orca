import { z } from 'zod'
import { TaskSourceContextSchema } from '../task-source-context-schema'
import { parseLinearIssueUrlIntent } from './links'

export const WorkspaceLinearLinkRequest = z
  .object({
    target: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('worktree'),
        selector: z.string().min(1),
        instanceId: z.string().min(1)
      }),
      z.object({ kind: z.literal('folder'), id: z.string().min(1), createdAt: z.number() })
    ]),
    expectedName: z.string(),
    expectedPath: z.string(),
    expectedBranch: z.string(),
    sourceContext: TaskSourceContextSchema,
    issue: z.object({
      id: z.string().uuid(),
      identifier: z.string().min(1),
      title: z.string().max(4096),
      url: z.string().max(4096),
      workspaceId: z.string().min(1),
      organizationUrlKey: z.string().min(1)
    })
  })
  .superRefine((request, ctx) => {
    const intent = parseLinearIssueUrlIntent(request.issue.url)
    const identity = request.sourceContext.providerIdentity
    if (
      !intent ||
      intent.identifier.toUpperCase() !== request.issue.identifier.toUpperCase() ||
      intent.organizationUrlKey.toLowerCase() !== request.issue.organizationUrlKey.toLowerCase() ||
      request.sourceContext.provider !== 'linear' ||
      identity?.provider !== 'linear' ||
      identity.workspaceId !== request.issue.workspaceId
    ) {
      ctx.addIssue({ code: 'custom', message: 'Linear issue and source identities must match.' })
    }
  })

export type WorkspaceLinearLinkRequest = z.infer<typeof WorkspaceLinearLinkRequest>
