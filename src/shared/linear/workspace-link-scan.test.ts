import { describe, expect, it } from 'vitest'
import { collectLinearLinkEvidence, hasWorkspaceIssueLink } from './workspace-link-scan'
import { scanWorkspace } from './workspace-link-scan.test-fixture'

describe('Linear link evidence', () => {
  it('extracts names, branch references and review URLs with organization evidence', () => {
    const result = collectLinearLinkEvidence(
      { branch: 'refs/heads/eng-42-fix', displayName: 'OPS-15' },
      'Fix https://linear.app/acme/issue/ENG-42/title'
    )
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'branch', identifier: 'ENG-42' }),
        expect.objectContaining({ source: 'name', identifier: 'OPS-15' }),
        expect.objectContaining({
          source: 'review',
          identifier: 'ENG-42',
          organizationUrlKey: 'acme'
        })
      ])
    )
  })
  it('uses the central identifier grammar and excludes dates, ranges and partial IDs', () => {
    expect(
      collectLinearLinkEvidence({ branch: '2026-07/8080-8090', displayName: 'ENG-42abc' })
    ).toEqual([])
    expect(
      collectLinearLinkEvidence({ branch: 'refs/heads/ENG_TEAM-42', displayName: '' })[0].identifier
    ).toBe('ENG_TEAM-42')
  })
  it('preserves existing issue links across providers while allowing a review link', () => {
    for (const patch of [
      { linkedLinearIssue: 'ENG-1' },
      { linkedIssue: 1 },
      { linkedGitLabIssue: 2 },
      {
        linkedWorkItem: {
          provider: 'jira' as const,
          type: 'issue' as const,
          number: 0,
          title: '',
          url: ''
        }
      }
    ]) {
      expect(hasWorkspaceIssueLink(scanWorkspace(patch))).toBe(true)
    }
    expect(hasWorkspaceIssueLink(scanWorkspace({ linkedPR: 20 }))).toBe(false)
  })
})
