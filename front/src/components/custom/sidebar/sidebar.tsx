import { useRouter } from '@tanstack/react-router'
import { ChevronDown, LogOut, Settings, Zap } from 'lucide-react'
import { Fragment, type JSX } from 'react'

import { useLogout } from '../../../queries/useAuth.ts'
import { Button } from '../../ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverSeparator,
  PopoverTrigger,
} from '../../ui/popover.tsx'
import SidebarPathway from './pathway.sidebar.tsx'
import SidebarPatient from './patient.sidebar.tsx'
import SidebarSoignant from './soignant.sidebar.tsx'

interface SidebarProps {
  components: string[]
  isVisible: boolean
  quickActions?: React.ReactNode[]
}

function Sidebar({ isVisible, components, quickActions }: SidebarProps) {
  const router = useRouter()
  const user = router.options.context?.authState?.user
  const { logoutMutation } = useLogout()
  const authState = router.options.context?.authState

  function getInitiales(firstName?: string, lastName?: string): string {
    return (
      (firstName?.trim()[0] ?? '') + (lastName?.trim()[0] ?? '')
    ).toUpperCase()
  }

  const handleLogout = () => {
    logoutMutation()
  }

  const componentMap: Record<string, JSX.Element> = {
    soignant: <SidebarSoignant user={user} />,
    pathway: <SidebarPathway />,
    patient: <SidebarPatient />,
  }

  return (
    <div
      className={`z-40 bg-foreground text-text fixed top-16 h-[calc(100vh-4rem)] w-64 border-r border-border-sidebar transition-all duration-300 ${
        isVisible ? 'translate-x-0' : '-translate-x-64'
      } bg-card text-text text-sm`}
    >
      <div className="flex flex-col justify-between h-full">
        {/* Custom sidebar */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-h-0">
            {components.map((key) => (
              <Fragment key={key}>{componentMap[key] || null}</Fragment>
            ))}
          </div>
        </div>

        <div>
          {/* Quick actions */}
          {quickActions && quickActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-2 mt-4 uppercase text-xs text-text-sidebar">
                Actions rapides <Zap className="w-3 h-3" />
              </div>
              <div className="flex flex-col border-t border-border-sidebar">
                {quickActions.map((action, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <div className="border-t border-border-sidebar" />
                    )}
                    <div className="px-3 py-2 w-full">{action}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          {/* User */}
          <div className="flex justify-between items-center text-sm py-4 px-4 border-t border-border-sidebar">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex shrink-0 justify-center items-center rounded bg-card w-10 h-10 text-foreground">
                {getInitiales(
                  authState?.user?.firstName,
                  authState?.user?.lastName,
                )}
              </div>
              <div className="min-w-0">
                <div className="text-md font-semibold truncate">
                  {authState?.user?.firstName} {authState?.user?.lastName}
                </div>
                <div className="text-text-sidebar text-xs truncate">
                  {authState?.user?.email}
                </div>
              </div>
            </div>

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  variant="none"
                  size="icon"
                  className="text-text-sidebar group"
                >
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end">
                <PopoverMenuItem
                  icon={<Settings className="w-4 h-4" />}
                  onClick={() => router.navigate({ to: '/user/settings' })}
                >
                  Réglages
                </PopoverMenuItem>
                <PopoverSeparator />
                <PopoverMenuItem
                  icon={<LogOut className="w-4 h-4" />}
                  variant="destructive"
                  onClick={handleLogout}
                >
                  Déconnecter
                </PopoverMenuItem>
              </PopoverContent>
            </PopoverRoot>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
