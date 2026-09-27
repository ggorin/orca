import type { Worktree } from '../worktree/types'
import { parseLinearIssueInput, parseLinearIssueUrlIntent } from './links'

export type LinearLinkEvidence = {
  identifier: string
  organizationUrlKey?: string
  source: 'branch' | 'name' | 'review'
  text: string
}

export function hasWorkspaceIssueLink(workspace: Partial<Worktree>): boolean {
  return Boolean(
    workspace.linkedLinearIssue ||
    workspace.linkedIssue ||
    workspace.linkedGitLabIssue ||
    workspace.linkedWorkItem?.type === 'issue'
  )
}

export function collectLinearLinkEvidence(
  workspace: Pick<Worktree, 'branch' | 'displayName'>,
  reviewTitle?: string
): LinearLinkEvidence[] {
  const result: LinearLinkEvidence[] = []
  const sources = [
    ['branch', workspace.branch],
    ['name', workspace.displayName],
    ['review', reviewTitle ?? '']
  ] as const
  for (const [source, raw] of sources) {
    const text = raw.slice(0, 4096)
    const qualified = new Set<string>()
    for (const match of text.matchAll(/https:\/\/linear\.app\/[^\s)\]>]+/gi)) {
      const intent = parseLinearIssueUrlIntent(match[0])
      if (intent) {
        qualified.add(intent.identifier.toUpperCase())
        result.push({ ...intent, identifier: intent.identifier.toUpperCase(), source, text })
      }
    }
    for (const match of text.matchAll(/(?:^|[^a-z0-9_])([a-z0-9_]+-[0-9]+)(?![a-z0-9_])/gi)) {
      const parsed = parseLinearIssueInput(match[1])
      if (!parsed) {
        continue
      }
      const identifier = parsed.identifier.toUpperCase()
      if (!qualified.has(identifier)) {
        result.push({ identifier, source, text })
      }
    }
  }
  return [...new Map(result.map((item) => [JSON.stringify(item), item])).values()]
}
