import { mkdirSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

for (const kind of ['worktree', 'folder'] as const) {
  test(`Linear link scan reviews and persists a ${kind} link`, async ({
    electronApp,
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await orcaPage.setViewportSize({ width: 1200, height: 900 })
    const directory = testInfo.outputPath('folder')
    mkdirSync(directory, { recursive: true })
    const targetId = await orcaPage.evaluate(
      async ({ kind, directory }) => {
        const state = window.__store!.getState()
        if (kind === 'folder') {
          const group = await window.api.projectGroups.create({
            name: 'Scan test',
            parentPath: directory,
            createdFrom: 'folder-scan'
          })
          await state.fetchProjectGroups()
          const folder = await state.createFolderWorkspace({
            projectGroupId: group.id,
            folderPath: directory,
            name: 'ENG-42 folder'
          })
          if (!folder) {
            throw new Error('Could not create folder')
          }
          return folder.id
        }
        const workspace = state.allWorktrees()[0]
        if (!workspace) {
          throw new Error('Missing seeded workspace')
        }
        const result = await state.updateWorktreeMeta(workspace.id, {
          displayName: 'ENG-42 checkout'
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
        return workspace.id
      },
      { kind, directory }
    )
    await electronApp.evaluate(({ ipcMain }) => {
      const workspace = {
        id: 'org',
        organizationId: 'org',
        organizationName: 'Scan fixture',
        organizationUrlKey: 'acme',
        displayName: 'Fixture',
        email: null
      }
      ipcMain.removeHandler('linear:status')
      ipcMain.handle('linear:status', () => ({
        connected: true,
        viewer: workspace,
        workspaces: [workspace],
        activeWorkspaceId: 'org',
        selectedWorkspaceId: 'org'
      }))
      ipcMain.removeHandler('linear:listIssues')
      ipcMain.handle('linear:listIssues', () => ({ items: [] }))
      ipcMain.removeHandler('linear:listTeams')
      ipcMain.handle('linear:listTeams', () => [])
      ipcMain.removeHandler('linear:getIssue')
      ipcMain.handle('linear:getIssue', (_event, args) =>
        args.id === 'ENG-42' || args.id === '11111111-1111-4111-8111-111111111111'
          ? {
              id: '11111111-1111-4111-8111-111111111111',
              workspaceId: 'org',
              identifier: 'ENG-42',
              title: 'Repair the launch flow',
              url: 'https://linear.app/acme/issue/ENG-42',
              state: { name: 'Todo', type: 'unstarted', color: '' },
              team: { id: 'team', key: 'ENG', name: 'Engineering' },
              labels: [],
              labelIds: [],
              priority: 0,
              updatedAt: ''
            }
          : null
      )
    })
    await orcaPage.evaluate(async () => {
      const state = window.__store!.getState()
      await state.checkLinearConnection(true)
      state.openTaskPage({ taskSource: 'linear' })
    })
    await orcaPage.getByRole('button', { name: 'Find Linear links', exact: true }).click()
    await orcaPage.screenshot({ path: testInfo.outputPath(`scan-${kind}-before.png`) })
    await orcaPage.getByRole('button', { name: 'Scan workspaces', exact: true }).click()
    await expect(
      orcaPage.getByRole('button', { name: 'Link selected issue', exact: true })
    ).toHaveCount(1)
    await orcaPage.screenshot({ path: testInfo.outputPath(`scan-${kind}-review.png`) })
    const before = await orcaPage.evaluate(
      async ({ kind, targetId }) => {
        if (kind === 'folder') {
          return (await window.api.folderWorkspaces.list()).find((folder) => folder.id === targetId)
            ?.linkedTask
        }
        const state = window.__store!.getState()
        return state.getKnownWorktreeById(targetId)?.linkedLinearIssue
      },
      { kind, targetId }
    )
    expect(before).toBeFalsy()
    await orcaPage.getByRole('button', { name: 'Link selected issue', exact: true }).click()
    await expect(orcaPage.getByRole('button', { name: 'Linked', exact: true })).toBeVisible()
    await orcaPage.screenshot({ path: testInfo.outputPath(`scan-${kind}-linked.png`) })
    await expect
      .poll(async () =>
        orcaPage.evaluate(
          async ({ kind, targetId }) => {
            if (kind === 'folder') {
              return (await window.api.folderWorkspaces.list()).find(
                (folder) => folder.id === targetId
              )?.linkedTask?.linearIdentifier
            }
            const response = await window.api.runtime.call({
              method: 'worktree.show',
              params: { worktree: `id:${targetId}` }
            })
            return JSON.stringify(response)
          },
          { kind, targetId }
        )
      )
      .toContain('ENG-42')
    await orcaPage.getByRole('button', { name: 'Scan workspaces', exact: true }).click()
    await expect(
      orcaPage.getByRole('button', { name: 'Link selected issue', exact: true })
    ).toHaveCount(0)
    await expect(orcaPage.getByText(/1 already linked/)).toBeVisible()
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
  })
}
