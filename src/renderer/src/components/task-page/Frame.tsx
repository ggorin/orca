import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { TaskPageListChrome } from './ListChrome'
import { TaskPageContent } from './Content'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { TaskPageSourceBar } from './SourceBar'
import { LinearAttentionPanel } from './linear/AttentionPanel'
import { WorkspaceLinkScan } from './linear/WorkspaceLinkScan'
export function TaskPageFrame({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const [attentionOpen, setAttentionOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const scanning = scanOpen && model.taskSource === 'linear'
  const attention = attentionOpen && model.taskSource === 'linear'
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Why: pt-1.5 (6px) aligns this 32px icon cluster's center with the sidebar Tasks row, 22px below the titlebar. */}
      <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-5 pt-1.5 pb-4 md:px-8 md:pt-1.5 md:pb-5">
        {attention || scanning ? (
          <TaskPageSourceBar model={model} />
        ) : (
          <TaskPageListChrome model={model} />
        )}
        {model.taskSource === 'linear' ? (
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAttentionOpen(!attentionOpen)
                setScanOpen(false)
              }}
            >
              {attention
                ? translate('linear.attention.back', 'Back to issues')
                : translate('linear.attention.show', 'Inbox and Triage')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScanOpen(!scanOpen)
                setAttentionOpen(false)
              }}
            >
              {scanning
                ? translate('linear.attention.back', 'Back to issues')
                : translate('linear.linkScan.title', 'Find Linear links')}
            </Button>
          </div>
        ) : null}
        {scanning ? (
          <WorkspaceLinkScan model={model} />
        ) : attention ? (
          <LinearAttentionPanel
            model={model}
            onOpenIssue={(issue) => {
              model.openRelatedLinearIssue(issue)
              setAttentionOpen(false)
            }}
          />
        ) : (
          <TaskPageContent model={model} />
        )}
      </div>
    </div>
  )
}
