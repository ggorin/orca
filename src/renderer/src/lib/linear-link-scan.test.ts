import { describe, expect, it, vi } from 'vitest'
import { scanLinearWorkspaceLinks } from './linear-link-scan'
import { scanWorkspace, scanIssue } from '../../../shared/linear/workspace-link-scan.test-fixture'
import type { LinearScanWorkspace } from './linear-link-scan-inventory'

const account = {
  id: 'org',
  organizationId: 'org',
  organizationName: 'Acme',
  organizationUrlKey: 'acme',
  displayName: 'User',
  email: null
}
function entry(
  key = 'one',
  overrides: Parameters<typeof scanWorkspace>[0] = {}
): LinearScanWorkspace {
  return {
    key,
    worktree: scanWorkspace(overrides),
    project: 'Project',
    hostLabel: 'Host',
    target: { kind: 'local' }
  }
}
function ports() {
  return {
    account,
    readIssue: vi.fn(async (id: string) => scanIssue(id)),
    readReviewTitle: vi.fn(async () => undefined),
    assertCurrent: vi.fn(),
    progress: vi.fn()
  }
}
describe('workspace link scan', () => {
  it('deduplicates provider lookups across workspaces and retains host-qualified rows', async () => {
    const dependencies = ports()
    const result = await scanLinearWorkspaceLinks({
      ...dependencies,
      workspaces: [
        entry(),
        { ...entry('remote'), target: { kind: 'environment', environmentId: 'remote' } }
      ]
    })
    expect(dependencies.readIssue).toHaveBeenCalledTimes(1)
    expect(result.proposals).toHaveLength(2)
  })
  it('does not resolve or replace linked issues', async () => {
    const dependencies = ports()
    const result = await scanLinearWorkspaceLinks({
      ...dependencies,
      workspaces: [entry('linked', { linkedLinearIssue: 'ENG-1' })]
    })
    expect(result.alreadyLinked).toBe(1)
    expect(dependencies.readIssue).not.toHaveBeenCalled()
  })
  it('retains ambiguity for explicit selection and rejects organization collisions', async () => {
    const dependencies = ports()
    const result = await scanLinearWorkspaceLinks({
      ...dependencies,
      workspaces: [
        entry('multi', { displayName: 'OPS-3' }),
        entry('wrong', { branch: '', displayName: 'https://linear.app/other/issue/ENG-42' })
      ]
    })
    expect(result.proposals[0].issues.map((issue) => issue.identifier)).toEqual(['ENG-42', 'OPS-3'])
    expect(result.proposals[1].issues).toEqual([])
    expect(result.proposals[1].warnings[0]).toContain('another Linear workspace')
  })
  it('shows failed lookup and mismatched returned workspace as unverified', async () => {
    const dependencies = ports()
    dependencies.readIssue.mockRejectedValueOnce(new Error('Rate limited'))
    const failed = await scanLinearWorkspaceLinks({ ...dependencies, workspaces: [entry()] })
    expect(failed.proposals[0].issues).toEqual([])
    expect(failed.proposals[0].warnings).toHaveLength(1)
    dependencies.readIssue.mockResolvedValueOnce(scanIssue('ENG-42', { workspaceId: 'other' }))
    expect(
      (await scanLinearWorkspaceLinks({ ...dependencies, workspaces: [entry()] })).proposals[0]
        .issues
    ).toEqual([])
  })
  it('discards provider replies after cancellation or profile change', async () => {
    const dependencies = ports()
    let changed = false
    dependencies.assertCurrent.mockImplementation(() => {
      if (changed) {
        throw new Error('changed')
      }
    })
    dependencies.readIssue.mockImplementation(async (id) => {
      changed = true
      return scanIssue(id)
    })
    await expect(
      scanLinearWorkspaceLinks({ ...dependencies, workspaces: [entry()] })
    ).rejects.toThrow('changed')
  })
})
