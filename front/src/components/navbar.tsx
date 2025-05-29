import { Link } from '@tanstack/react-router'
import { AlignJustify, Cog } from 'lucide-react'
import { Button } from './ui/button.tsx'
import {
  DropdownMenuCustomContent,
  DropdownMenuCustomItem,
} from './ui/dropdownMenu.tsx'
import { DropdownMenu } from 'radix-ui'
import ThemeToggle from './custom/themeToggle.tsx'
import TodoSheet from './custom/Todo/todoSheet.tsx'

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
          <Link to="/planning">Planning</Link>
        </DropdownMenuCustomItem>
        <DropdownMenuCustomItem>
          <Link to="/soignant">Soignants</Link>
        </DropdownMenuCustomItem>
      </DropdownMenu.Sub>
    </DropdownMenuCustomContent>
  </DropdownMenu.Root>
)

function Navbar({ toggleSidebar }: NavbarProps) {
  return (
    <div className="h-16 px-4 flex justify-between items-center bg-background text-text">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="cursor-pointer text-background text-text"
        >
          <AlignJustify className="w-5 h-5" />
        </Button>
        <div className="flex gap-4">
          <Link
            to="/dashboard"
            className="border-b-2 border-transparent [&.active]:font-bold [&.active]:border-primary"
          >
            Dashboard
          </Link>
          <Link
            to="/patient"
            className="border-b-2 border-transparent [&.active]:font-bold [&.active]:border-primary"
          >
            Patients
          </Link>
          <Link to="/auth/login" className="[&.active]:font-bold">
            Login
          </Link>
        </div>
      </div>
      <div className="flex gap-8">
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <SettingsMenu />
          <TodoSheet />
        </div>
      </div>
    </div>
  )
}

export default Navbar
