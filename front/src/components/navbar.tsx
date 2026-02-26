import { Link, useMatchRoute, useRouter } from '@tanstack/react-router'
import { CalendarDays, Cog, PanelLeft, Tag, UserCog, Users } from 'lucide-react'

import TodoSheet from './custom/todo/todoSheet.tsx'
import { Button } from './ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverTrigger,
} from './ui/popover.tsx'

interface NavbarProps {
  toggleSidebar: () => void
}

const SettingsMenu = () => {
  const router = useRouter()

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button variant="none" size="icon">
          <Cog className="text-text w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent sideOffset={2} align="end">
        <PopoverMenuItem
          icon={<CalendarDays className="w-4 h-4" />}
          onClick={() => router.navigate({ to: '/settings/planning' })}
        >
          Planning
        </PopoverMenuItem>
        <PopoverMenuItem
          icon={<Users className="w-4 h-4" />}
          onClick={() => router.navigate({ to: '/settings/soignant' })}
        >
          Soignants
        </PopoverMenuItem>
        <PopoverMenuItem
          icon={<Tag className="w-4 h-4" />}
          onClick={() => router.navigate({ to: '/settings/thematic' })}
        >
          Thématiques
        </PopoverMenuItem>
        <PopoverMenuItem
          icon={<UserCog className="w-4 h-4" />}
          onClick={() => router.navigate({ to: '/settings/user' })}
        >
          Utilisateurs
        </PopoverMenuItem>
      </PopoverContent>
    </PopoverRoot>
  )
}

function Navbar({ toggleSidebar }: NavbarProps) {
  const router = useRouter()
  const user = router.options.context?.authState?.user
  const isAdmin = user?.role === 'ADMIN'
  const matchRoute = useMatchRoute()
  const isActive = (to: string) => !!matchRoute({ to, fuzzy: false })

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 h-16 flex justify-between items-center bg-foreground text-text border-b border-border-sidebar">
      <div className="flex items-center gap-4">
        <div className="flex justify-between items-center w-60">
          <h2 className="px-2 text-3xl font-bold">
            <span className="text-primary">Medi</span>Sync
          </h2>
          <Button
            variant="none"
            size="icon"
            onClick={toggleSidebar}
            className="cursor-pointer text-text"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex gap-4">
          <Link
            to="/dashboard"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/dashboard') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
          >
            Dashboard
          </Link>

          <Link
            to="/patient"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/patient') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
          >
            Patients
          </Link>
        </div>
      </div>
      <div className="flex gap-8 pl-4 border-l border-border-sidebar">
        <div className="flex items-center gap-2">
          {isAdmin && <SettingsMenu />}
          <TodoSheet />
        </div>
      </div>
    </div>
  )
}

export default Navbar
