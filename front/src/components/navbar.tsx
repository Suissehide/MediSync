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
          <Link to="/settings/planning" className="w-full">
            Planning
          </Link>
        </DropdownMenuCustomItem>
        <DropdownMenuCustomItem>
          <Link to="/settings/soignant" className="w-full">
            Soignants
          </Link>
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
            className="relative cursor-pointer
               transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left"
          >
            Dashboard
          </Link>

          <Link
            to="/patient"
            className="relative cursor-pointer
               transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left"
          >
            Patients
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
