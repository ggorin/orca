import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('Overview connects project context, host coverage, Runs and Linear without launching work', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.setViewportSize({ width: 1200, height: 900 })
  await orcaPage.screenshot({ path: testInfo.outputPath('before-overview.png') })
  const initialTabs = await orcaPage.evaluate(() =>
    Object.values(window.__store!.getState().tabsByWorktree)
      .flat()
      .map((tab) => tab.id)
  )
  await orcaPage.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(
    orcaPage.getByRole('button', { name: 'Project home', exact: true }).first()
  ).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('overview-projects.png') })
  await orcaPage.getByRole('button', { name: 'Project home', exact: true }).first().click()
  await expect(
    orcaPage.getByRole('heading', { name: 'Project context', exact: true })
  ).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Overview', exact: true }).click()
  await orcaPage.getByRole('tab', { name: 'Runs', exact: true }).click()
  await orcaPage.getByRole('button', { name: 'Refresh Runs', exact: true }).click()
  await expect(
    orcaPage.getByText('Legacy orchestration state (inspect only)', { exact: true })
  ).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Inspect', exact: true }).click()
  await expect(
    orcaPage.getByText('No workers recorded for this Run.', { exact: true })
  ).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Refresh details', exact: true })).toBeEnabled()
  await orcaPage.screenshot({ path: testInfo.outputPath('overview-runs.png') })
  await orcaPage.evaluate(() =>
    window.__store!.setState({
      sshTargetLabels: new Map([['unavailable', 'Disconnected build host']]),
      sshConnectionStates: new Map()
    })
  )
  await orcaPage.getByRole('tab', { name: 'Hosts', exact: true }).click()
  await expect(orcaPage.getByText('Disconnected build host', { exact: true })).toBeVisible()
  await expect(
    orcaPage.getByText('Unavailable hosts may still have running work.', { exact: false })
  ).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('overview-hosts.png') })
  await orcaPage.getByRole('tab', { name: 'Agents', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('tab', { name: 'Agents', exact: true })).toHaveAttribute(
    'data-state',
    'active'
  )
  await orcaPage.screenshot({ path: testInfo.outputPath('overview-agents.png') })
  expect(
    await orcaPage.evaluate(() =>
      Object.values(window.__store!.getState().tabsByWorktree)
        .flat()
        .map((tab) => tab.id)
    )
  ).toEqual(initialTabs)
  await orcaPage.getByRole('button', { name: 'Open Linear work', exact: true }).click()
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store!.getState().activeView))
    .toBe('tasks')
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((win) => win.isVisible())
    )
  ).toBe(false)
})
