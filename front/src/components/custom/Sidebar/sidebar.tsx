import { useRouter } from '@tanstack/react-router'
import { CircleHelp, Power, Settings } from 'lucide-react'
import { Fragment, type JSX } from 'react'

import { useLogout } from '../../../queries/useAuth.ts'
import { Button } from '../../ui/button.tsx'
import SidebarPathway from './pathway.sidebar.tsx'
import SidebarPatient from './patient.sidebar.tsx'
import SidebarSoignant from './soignant.sidebar.tsx'

interface SidebarProps {
  components: string[]
  isVisible: boolean
}

function Sidebar({ isVisible, components }: SidebarProps) {
  const router = useRouter()
  const { logoutMutation } = useLogout()
  const { authState } = router.options.context

  function getInitiales(firstName?: string, lastName?: string): string {
    return (
      (firstName?.trim()[0] ?? '') + (lastName?.trim()[0] ?? '')
    ).toUpperCase()
  }

  const handleLogout = () => {
    logoutMutation()
  }

  const componentMap: Record<string, JSX.Element> = {
    soignant: <SidebarSoignant />,
    pathway: <SidebarPathway />,
    patient: <SidebarPatient />,
  }

  return (
    <div
      className={`fixed h-full w-64 transition-all duration-300 ${
        isVisible ? 'translate-x-0' : '-translate-x-64'
      } bg-card text-text text-sm`}
    >
      <div className="flex flex-col justify-between h-full px-2 py-4">
        <div>
          <div className="flex justify-between items-center mb-6 mt-2">
            <h1 className="px-2 text-3xl font-bold">
              <span className="text-primary">Medi</span>Sync
            </h1>
          </div>
          <div>
            {components.map((key) => (
              <Fragment key={key}>{componentMap[key] || null}</Fragment>
            ))}
          </div>
        </div>

        <div>
          <ol className="flex flex-col py-2 ">
            <li className="">
              <button
                type="button"
                className="cursor-pointer w-full py-2 pl-2 flex items-center gap-2 rounded-lg hover:bg-primary/15"
              >
                <CircleHelp className="w-5 h-5" />
                Aide et assistance
              </button>
            </li>
            <li className="">
              <button
                type="button"
                className="cursor-pointer w-full py-2 pl-2 flex items-center gap-2 rounded-lg hover:bg-primary/15"
              >
                <Settings className="w-5 h-5" />
                Paramètres
              </button>
            </li>
          </ol>

          <div className="flex justify-between items-center text-sm pt-4 border-t-1 border-border">
            <div className="flex items-center gap-3">
              <div className="flex justify-center items-center rounded-full bg-primary w-8 h-8 text-white">
                {getInitiales(
                  authState.user?.firstName,
                  authState.user?.lastName,
                )}
              </div>
              <div>
                <div className="font-bold">
                  {authState.user?.firstName} {authState.user?.lastName}
                </div>
                <div className="text-light text-xs">
                  {authState.user?.email}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              className="bg-background"
            >
              <Power className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
