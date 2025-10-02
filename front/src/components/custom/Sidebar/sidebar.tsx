import { CircleHelp, Power, Settings } from 'lucide-react'
import { useLogout } from '../../../queries/useAuth.ts'
import { Button } from '../../ui/button.tsx'
import { useRouter } from '@tanstack/react-router'
import SidebarSoignant from './soignant.tsx'
import SidebarPathway from './pathway.tsx'

interface SidebarProps {
  component?: string
  isVisible: boolean
}

function Sidebar({ component, isVisible }: SidebarProps) {
  const router = useRouter()
  const { logoutMutation } = useLogout()
  const { authState } = router.options.context

  function getInitiales(firstname?: string, lastname?: string): string {
    return (
      (firstname?.trim()[0] ?? '') + (lastname?.trim()[0] ?? '')
    ).toUpperCase()
  }

  const handleLogout = () => {
    logoutMutation()
  }

  return (
    <div
      className={`fixed h-full w-64 transition-all duration-300 ${
        isVisible ? 'translate-x-0' : '-translate-x-64'
      } bg-card text-text text-sm`}
    >
      <div className="flex flex-col justify-between h-full px-2 py-4">
        <div className="">
          <div className="flex justify-between items-center mb-8">
            <h1 className="my-0! ml-2!">
              <span className="text-primary">Medi</span>Sync
            </h1>
          </div>
          <div>
            {component === 'soignant' ? <SidebarSoignant /> : null}
            {component === 'pathway' ? <SidebarPathway /> : null}
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
                  authState.user?.firstname,
                  authState.user?.lastname,
                )}
              </div>
              <div>
                <div className="font-bold">
                  {authState.user?.firstname} {authState.user?.lastname}
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
