import { defineMethod } from '../core'
import { WorkspaceLinearLinkRequest } from '../../../../shared/linear/workspace-link-request'

export const WORKSPACE_LINEAR_LINK_METHODS = [
  defineMethod({
    name: 'workspace.linkLinearIssue',
    params: WorkspaceLinearLinkRequest,
    handler: (params, { runtime }) => runtime.linkWorkspaceLinearIssue(params)
  })
]
