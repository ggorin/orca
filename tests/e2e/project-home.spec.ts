import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, ensureTerminalVisible } from './helpers/store'
import { waitForActivePanePtyId, waitForActivePaneHookDescriptor } from './helpers/terminal'
import { RuntimeClient } from '../../src/cli/runtime-client'

test('Project home saves context and preserves a draft when another client edits it', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const repo = state.repos[0]
    if (!repo) {
      throw new Error('Seed repository missing')
    }
    state.openProjectHome(repo)
  })
  await expect(orcaPage.getByRole('heading', { name: 'Project context' })).toBeVisible()
  const goal = orcaPage.getByLabel('Goal', { exact: true })
  const instructions = orcaPage.getByLabel('Instructions', { exact: true })
  await goal.fill('Ship the project home')
  await instructions.fill('Run tests before marking work complete.')
  await orcaPage.getByRole('button', { name: 'Save context', exact: true }).click()
  await expect(orcaPage.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  await orcaPage.getByText('Preview coordinator draft', { exact: true }).click()
  await expect(
    orcaPage.getByText('Coordinate this project using Orca', { exact: false })
  ).toContainText('Ship the project home')
  await expect(orcaPage.getByText('No runs yet.', { exact: false })).toBeVisible()
  await goal.fill('My unsaved draft')
  await orcaPage.evaluate(async () => {
    const repo = window.__store!.getState().projectHomeRepo!
    const project = (await window.api.projects.list()).find((entry) =>
      entry.sourceRepoIds.includes(repo.id)
    )!
    await window.api.projects.update({
      projectId: project.id,
      updates: {
        coordination: {
          goal: 'Other client goal',
          instructions: 'Other instructions',
          expectedRevision: project.coordination?.revision ?? 0
        }
      }
    })
  })
  await orcaPage.getByRole('button', { name: 'Save context', exact: true }).click()
  await expect(orcaPage.getByRole('alert')).toContainText('changed')
  await expect(goal).toHaveValue('My unsaved draft')
  await orcaPage.getByRole('button', { name: 'Load latest saved context' }).click()
  await expect(
    orcaPage.getByRole('status').filter({ hasText: 'Your draft is preserved' })
  ).toBeVisible()
  await expect(orcaPage.getByText('Other client goal', { exact: false }).first()).toBeVisible()
  await expect(goal).toHaveValue('My unsaved draft')
  await orcaPage.screenshot({ path: testInfo.outputPath('project-home.png'), fullPage: true })
  await orcaPage.getByRole('button', { name: 'Back to workspace' }).click()
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    state.openProjectHome(state.projectHomeRepo!)
  })
  await expect(orcaPage.getByLabel('Goal', { exact: true })).toHaveValue('My unsaved draft')
  await orcaPage.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(orcaPage.getByLabel('Goal', { exact: true })).toHaveValue('Other client goal')
  await orcaPage.evaluate(async () => {
    const repo = window.__store!.getState().projectHomeRepo!
    const project = (await window.api.projects.list()).find((entry) =>
      entry.sourceRepoIds.includes(repo.id)
    )!
    await window.api.projects.update({
      projectId: project.id,
      updates: {
        coordination: {
          goal: 'Newest saved goal',
          instructions: 'Fresh instructions',
          expectedRevision: project.coordination?.revision ?? 0
        }
      }
    })
  })
  await orcaPage.getByRole('button', { name: 'Load latest saved context' }).click()
  await expect(orcaPage.getByLabel('Goal', { exact: true })).toHaveValue('Newest saved goal')
  await expect(orcaPage.getByLabel('Instructions', { exact: true })).toHaveValue(
    'Fresh instructions'
  )
  await expect(
    orcaPage.getByRole('button', { name: 'Discard draft', exact: true })
  ).not.toBeVisible()
})

test('Project home shows real repository runs and opens the existing coordinator', async ({
  orcaPage,
  electronApp
}) => {
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActivePanePtyId(orcaPage)
  const pane = await waitForActivePaneHookDescriptor(orcaPage)
  const client = new RuntimeClient(
    await electronApp.evaluate(({ app }) => app.getPath('userData')),
    30_000,
    null,
    null
  )
  const coordinator = await client.call<{ terminal: { handle: string } }>('terminal.resolvePane', {
    paneKey: pane.paneKey
  })
  const handle = coordinator.result.terminal.handle
  const created = await client.call<{ run: { id: string } }>('orchestration.runCreate', {
    objective: 'Review the native Project home',
    from: handle
  })
  await client.call('orchestration.taskCreate', {
    run: created.result.run.id,
    callerTerminalHandle: handle,
    taskTitle: 'Check project behavior',
    spec: 'Verify saved context and run history.'
  })
  await orcaPage
    .getByRole('button', { name: /Project actions for / })
    .first()
    .hover()
  await orcaPage
    .getByRole('button', { name: /^Project actions for / })
    .first()
    .click()
  await orcaPage.getByRole('menuitem', { name: 'Project home', exact: true }).click()
  await orcaPage.getByRole('button', { name: /Review the native Project home/ }).click()
  const details = orcaPage.getByRole('region', { name: 'Run details' })
  await expect(
    details.getByRole('heading', { name: 'Review the native Project home' })
  ).toBeVisible()
  await expect(details.getByText('No workers in this run yet.')).toBeVisible()
  await details.getByText(/Check project behavior/).click()
  await expect(details.getByText('Verify saved context and run history.')).toBeVisible()
  await details.getByRole('button', { name: 'Open coordinator', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Project context' })).not.toBeVisible()
  await expect(orcaPage.locator('.xterm').first()).toBeVisible()
})
