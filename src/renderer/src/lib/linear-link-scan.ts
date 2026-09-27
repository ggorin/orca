import type { LinearIssue } from '../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../shared/linear/workspace-types'
import {
  collectLinearLinkEvidence,
  hasWorkspaceIssueLink,
  type LinearLinkEvidence
} from '../../../shared/linear/workspace-link-scan'
import { parseLinearIssueUrlIntent } from '../../../shared/linear/links'
import type { LinearScanWorkspace } from './linear-link-scan-inventory'

export type LinearLinkProposal = {
  workspace: LinearScanWorkspace
  evidence: LinearLinkEvidence[]
  issues: LinearIssue[]
  warnings: string[]
}

export type LinearLinkScanResult = {
  proposals: LinearLinkProposal[]
  scanned: number
  alreadyLinked: number
  withoutEvidence: number
  warnings: string[]
}

export function isVerifiedScanIssue(
  issue: LinearIssue,
  account: LinearWorkspace,
  identifier: string
): boolean {
  const intent = parseLinearIssueUrlIntent(issue.url)
  return Boolean(
    issue.id &&
    issue.workspaceId === account.id &&
    issue.identifier.toUpperCase() === identifier.toUpperCase() &&
    intent?.identifier.toUpperCase() === identifier.toUpperCase() &&
    intent?.organizationUrlKey.toLowerCase() === account.organizationUrlKey?.toLowerCase()
  )
}

export async function scanLinearWorkspaceLinks(args: {
  workspaces: LinearScanWorkspace[]
  account: LinearWorkspace
  readIssue: (identifier: string) => Promise<LinearIssue | null>
  readReviewTitle: (workspace: LinearScanWorkspace) => Promise<string | undefined>
  assertCurrent: () => void
  progress: (label: string) => void
}): Promise<LinearLinkScanResult> {
  const result: LinearLinkScanResult = {
    proposals: [],
    scanned: 0,
    alreadyLinked: 0,
    withoutEvidence: 0,
    warnings: []
  }
  const lookup = new Map<string, Promise<LinearIssue | null>>()
  const limit = 250
  if (args.workspaces.length > limit) {
    result.warnings.push(
      `Scan limited to ${limit} workspaces; ${args.workspaces.length - limit} were not scanned.`
    )
  }
  for (const workspace of args.workspaces.slice(0, limit)) {
    args.assertCurrent()
    result.scanned++
    if (hasWorkspaceIssueLink(workspace.worktree) || workspace.folder?.linkedTask) {
      result.alreadyLinked++
      continue
    }
    args.progress(workspace.worktree.displayName)
    const warnings: string[] = []
    let reviewTitle: string | undefined
    try {
      reviewTitle = await args.readReviewTitle(workspace)
    } catch {
      warnings.push('Review title unavailable; scanned workspace name and branch only.')
    }
    args.assertCurrent()
    const evidence = collectLinearLinkEvidence(workspace.worktree, reviewTitle)
    if (!evidence.length) {
      result.withoutEvidence++
      result.warnings.push(
        ...warnings.map((warning) => `${workspace.worktree.displayName}: ${warning}`)
      )
      continue
    }
    const issues: LinearIssue[] = []
    for (const identifier of new Set(evidence.map((entry) => entry.identifier))) {
      args.assertCurrent()
      const references = evidence.filter((entry) => entry.identifier === identifier)
      if (
        references.some(
          (entry) =>
            entry.organizationUrlKey &&
            entry.organizationUrlKey.toLowerCase() !==
              args.account.organizationUrlKey?.toLowerCase()
        )
      ) {
        warnings.push(`${identifier}: reference belongs to another Linear workspace.`)
        continue
      }
      if (!lookup.has(identifier)) {
        if (lookup.size >= 100) {
          warnings.push(`${identifier}: lookup limit reached; not verified.`)
          continue
        }
        lookup.set(
          identifier,
          args.readIssue(identifier).catch(() => null)
        )
      }
      const issue = await lookup.get(identifier)
      args.assertCurrent()
      if (issue && isVerifiedScanIssue(issue, args.account, identifier)) {
        issues.push(issue)
      } else {
        warnings.push(
          `${identifier}: could not verify access and identity in this Linear workspace.`
        )
      }
    }
    result.proposals.push({ workspace, evidence, issues, warnings })
  }
  return result
}
