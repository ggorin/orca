import { isWebClientLocation } from '@/lib/web-client-location'
import { LayoutDashboard } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export function ManagementOverviewNav(): React.JSX.Element | null {
  const active = useAppStore((state) => state.activeView === 'management-overview')
  if (isWebClientLocation()) {
    return null
  }
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
      onClick={() => useAppStore.getState().setActiveView('management-overview')}
    >
      <LayoutDashboard className="size-4 shrink-0" />
      {translate('managementOverview.title', 'Overview')}
    </button>
  )
}
