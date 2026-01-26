import { Link, useMatchRoute, useRouter } from '@tanstack/react-router'
import { AlignJustify, Cog } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'

import TodoSheet from './custom/Todo/todoSheet.tsx'
import ThemeToggle from './custom/themeToggle.tsx'
import { Button } from './ui/button.tsx'
import {
  DropdownMenuCustomContent,
  DropdownMenuCustomItem,
} from './ui/dropdownMenu.tsx'

interface NavbarProps {
  toggleSidebar: () => void
}

const SettingsMenu = () => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="ghost" size="icon">
        <Cog className="w-5 h-5" />
      </Button>
    </DropdownMenu.Trigger>

    <DropdownMenuCustomContent sideOffset={12} align={'end'}>
      <DropdownMenu.Sub>
        <DropdownMenuCustomItem>
          <Link to="/settings/planning" className="w-full px-3 py-1.5">
            Planning
          </Link>
        </DropdownMenuCustomItem>
        <DropdownMenuCustomItem>
          <Link to="/settings/soignant" className="w-full px-3 py-1.5">
            Soignants
          </Link>
        </DropdownMenuCustomItem>
        <DropdownMenuCustomItem>
          <Link to="/settings/user" className="w-full px-3 py-1.5">
            Utilisateurs
          </Link>
        </DropdownMenuCustomItem>
      </DropdownMenu.Sub>
    </DropdownMenuCustomContent>
  </DropdownMenu.Root>
)

function Navbar({ toggleSidebar }: NavbarProps) {
  const router = useRouter()
  const user = router.options.context?.authState?.user
  const isAdmin = user?.role === 'ADMIN'
  const matchRoute = useMatchRoute()
  const isActive = (to: string) => !!matchRoute({ to, fuzzy: false })

  return (
    <div className="px-4 py-2 flex justify-between items-center bg-background text-text border-b border-border">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="cursor-pointer text-text"
        >
          <AlignJustify className="w-5 h-5" />
        </Button>
        <div className="flex gap-4">
          <Link
            to="/dashboard"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/dashboard') ? 'text-primary after:scale-x-100' : 'text-muted-foreground'}`}
          >
            Dashboard
          </Link>

          <Link
            to="/patient"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/patient') ? 'text-primary after:scale-x-100' : 'text-muted-foreground'}`}
          >
            Patients
          </Link>
        </div>
      </div>
      <div className="flex gap-8">
        <ThemeToggle />
        <div className="flex items-center gap-2">
          {isAdmin && <SettingsMenu />}
          <TodoSheet />
        </div>
      </div>
    </div>
  )
}

export default Navbar
