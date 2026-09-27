import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { createLinearLinkScanSession } from '@/lib/linear-link-scan-session'
import type { LinearLinkProposal, LinearLinkScanResult } from '@/lib/linear-link-scan'
import { linearWorkspaceScopeSignature } from '../../../../../shared/linear/workspace-types'
import type { LinearWorkspace } from '../../../../../shared/linear/workspace-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

type ScanSession = ReturnType<typeof createLinearLinkScanSession>

export function WorkspaceLinkScan({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const scope = JSON.stringify([
    profile,
    model.linearTaskSourceContext,
    model.providerRuntimeContextKey,
    linearWorkspaceScopeSignature(model.linearStatus)
  ])
  const sourceContext: TaskSourceContext = model.linearTaskSourceContext ?? {
    kind: 'task-source',
    provider: 'linear',
    projectId: 'linear-link-scan',
    hostId: model.settings?.activeRuntimeEnvironmentId
      ? `runtime:${model.settings.activeRuntimeEnvironmentId}`
      : 'local'
  }
  return (
    <ScanPanel
      key={scope}
      accounts={model.linearStatus.workspaces ?? []}
      defaultAccount={model.linearStatus.selectedWorkspaceId ?? ''}
      sourceContext={sourceContext}
    />
  )
}

function ScanPanel({
  accounts,
  defaultAccount,
  sourceContext
}: {
  accounts: LinearWorkspace[]
  defaultAccount: string
  sourceContext: TaskSourceContext
}): React.JSX.Element {
  const [accountId, setAccountId] = useState(
    accounts.some((account) => account.id === defaultAccount) ? defaultAccount : ''
  )
  const [result, setResult] = useState<LinearLinkScanResult | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<ScanSession | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function scan(): Promise<void> {
    const account = accounts.find((item) => item.id === accountId)
    if (!account || progress !== null) {
      return
    }
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    const nextSession = createLinearLinkScanSession(account, sourceContext, nextController.signal)
    session.current = nextSession
    setResult(null)
    setError(null)
    setProgress(translate('linear.linkScan.reading', 'Reading workspaces…'))
    try {
      const next = await nextSession.scan((label) => {
        if (!nextController.signal.aborted) {
          setProgress(label)
        }
      })
      if (!nextController.signal.aborted) {
        setResult(next)
      }
    } catch (failure) {
      if (!nextController.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Scan failed.')
      }
    } finally {
      if (!nextController.signal.aborted) {
        setProgress(null)
      }
    }
  }
  return (
    <section
      className="mt-3 flex min-h-0 flex-1 flex-col gap-3"
      aria-label={translate('linear.linkScan.title', 'Find Linear links')}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">
          {translate('linear.linkScan.title', 'Find Linear links')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate(
            'linear.linkScan.description',
            'Scan registered projects and connected hosts for ticket IDs in workspace names, branches, and available linked PR/MR titles. Review each match before linking. Existing issue links are preserved; Linear tickets are not changed.'
          )}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="linear-link-scan-account">
            {translate('linear.linkScan.account', 'Linear workspace')}
          </Label>
          <Select
            value={accountId}
            disabled={progress !== null}
            onValueChange={(value) => {
              controller.current?.abort()
              session.current = null
              setAccountId(value)
              setResult(null)
              setError(null)
            }}
          >
            <SelectTrigger id="linear-link-scan-account">
              <SelectValue
                placeholder={translate('linear.linkScan.chooseAccount', 'Choose a workspace')}
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.organizationName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!accountId || progress !== null}
          onClick={() => void scan()}
        >
          {translate('linear.linkScan.scan', 'Scan workspaces')}
        </Button>
        {progress !== null ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              controller.current?.abort()
              session.current = null
              setProgress(null)
            }}
          >
            {translate('linear.linkScan.cancel', 'Cancel')}
          </Button>
        ) : null}
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'linear.linkScan.connect',
            'Connect Linear in Settings → Integrations to verify matches.'
          )}
        </p>
      ) : null}
      {progress !== null ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('linear.linkScan.progress', 'Scanning: {{name}}', { name: progress })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="min-h-0 space-y-3 overflow-y-auto scrollbar-sleek">
          <p role="status" className="text-xs text-muted-foreground">
            {translate(
              'linear.linkScan.summary',
              '{{scanned}} scanned · {{linked}} already linked · {{empty}} without ticket references',
              {
                scanned: result.scanned,
                linked: result.alreadyLinked,
                empty: result.withoutEvidence
              }
            )}
          </p>
          {[...new Set(result.warnings)].map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
          {result.proposals.length === 0 ? (
            <p className="text-sm">
              {translate(
                'linear.linkScan.empty',
                'No new matches found in the workspaces scanned.'
              )}
            </p>
          ) : null}
          {result.proposals.map((proposal) => (
            <ProposalRow
              key={proposal.workspace.key}
              proposal={proposal}
              session={session.current}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ProposalRow({
  proposal,
  session
}: {
  proposal: LinearLinkProposal
  session: ScanSession | null
}): React.JSX.Element {
  const { workspace, issues } = proposal
  const [selected, setSelected] = useState(issues.length === 1 ? issues[0].id : '')
  const [state, setState] = useState<'ready' | 'saving' | 'linked' | 'error'>('ready')
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  async function link(): Promise<void> {
    const issue = issues.find((item) => item.id === selected)
    if (!issue || !session || saving.current) {
      return
    }
    saving.current = true
    setState('saving')
    setError(null)
    try {
      await session.link(workspace, issue)
      setState('linked')
    } catch (failure) {
      setState('error')
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not confirm link. Scan again before retrying.'
      )
    } finally {
      saving.current = false
    }
  }
  return (
    <div className="space-y-2 border-b border-border py-3">
      <div>
        <p className="text-sm font-medium">{workspace.worktree.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {workspace.hostLabel} · {workspace.worktree.path}
        </p>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {proposal.evidence.map((item) => (
          <li key={JSON.stringify(item)}>
            {item.source}: {item.text}
          </li>
        ))}
      </ul>
      {proposal.warnings.map((warning) => (
        <p key={warning} className="text-xs text-muted-foreground">
          {warning}
        </p>
      ))}
      {issues.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selected}
            disabled={state === 'saving' || state === 'linked'}
            onValueChange={setSelected}
          >
            <SelectTrigger
              aria-label={translate('linear.linkScan.chooseIssueLabel', 'Issue for {{name}}', {
                name: workspace.worktree.displayName
              })}
            >
              <SelectValue
                placeholder={translate(
                  'linear.linkScan.chooseIssue',
                  'Multiple matches — choose an issue'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {issues.map((issue) => (
                <SelectItem key={issue.id} value={issue.id}>
                  {issue.identifier} · {issue.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selected || state === 'saving' || state === 'linked'}
            onClick={() => void link()}
          >
            {state === 'linked'
              ? translate('linear.linkScan.linked', 'Linked')
              : translate('linear.linkScan.link', 'Link selected issue')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
