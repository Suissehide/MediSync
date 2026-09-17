import { Plus } from 'lucide-react'

import type { User } from '../../../types/auth.ts'
import { Button } from '../../ui/button.tsx'
import AddSoignantForm from '../popup/addSoignantForm.tsx'
import SoignantFilterSection from './soignantFilter.section.tsx'

interface SidebarSoignantProps {
  user?: User | null
}

function SidebarSoignant({ user }: SidebarSoignantProps) {
  const isAdmin = user?.role === 'ADMIN'

  return (
    <SoignantFilterSection
      isAdmin={isAdmin}
      title={<p>Soignants</p>}
      addAction={
        isAdmin && (
          <AddSoignantForm
            trigger={
              <Button variant="gradient" size="icon">
                <Plus className="w-5 h-5" />
              </Button>
            }
          />
        )
      }
    />
  )
}

export default SidebarSoignant
