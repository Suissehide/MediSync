import { Plus } from 'lucide-react'

import { useCan } from '../../../hooks/useCan.ts'
import { Button } from '../../ui/button.tsx'
import AddSoignantForm from '../popup/addSoignantForm.tsx'
import SoignantFilterSection from './soignantFilter.section.tsx'

function SidebarSoignant() {
  const isAdmin = useCan('referentials:write')

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
