import { Plus, Stethoscope, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import type { User } from '../../../types/auth.ts'
import { Button } from '../../ui/button.tsx'
import AddSoignantForm from '../popup/addSoignantForm.tsx'
import DeleteSoignantForm from '../popup/deleteSoignantForm.tsx'

interface SidebarSoignantProps {
  user?: User | null
}

function SidebarSoignant({ user }: SidebarSoignantProps) {
  useSoignantQueries()

  const isAdmin = user?.role === 'ADMIN'
  const soignants = useSoignantStore((state) => state.soignants)
  const selectSoignant = useSoignantStore((state) => state.selectSoignant)
  const selectedSoignantID = useSoignantStore(
    (state) => state.selectedSoignantID,
  )

  const [isHovered, setIsHovered] = useState('')

  const handleSelectSoignant = (soignantID: string) => {
    selectSoignant(soignantID)
  }

  useEffect(() => {
    if (!selectedSoignantID && soignants.length > 0) {
      selectSoignant(soignants[0].id)
    }
  }, [selectedSoignantID, soignants, selectSoignant])

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Soignants</p>
        {isAdmin && (
          <AddSoignantForm
            trigger={
              <Button variant="gradient" size="icon">
                <Plus className="w-5 h-5" />
              </Button>
            }
          />
        )}
      </div>
      <ul className="mx-2 px-2 py-2 bg-sidebar flex-1 flex flex-col min-h-0 overflow-y-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {soignants.map((soignant) => (
          <li
            key={soignant.id}
            onMouseEnter={() => setIsHovered(soignant.id)}
            onMouseLeave={() => setIsHovered('')}
            className={`relative w-full flex justify-between items-center gap-2 rounded-lg text-white ${selectedSoignantID === soignant.id ? 'bg-[#ffffff10]' : ''} hover:bg-[#ffffff20]`}
          >
            <button
              type="button"
              onClick={() => handleSelectSoignant(soignant.id)}
              className={'cursor-pointer w-full py-2 pl-2'}
            >
              <span className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5" />
                {soignant.name}
              </span>
            </button>

            {isAdmin && isHovered === soignant.id && (
              <DeleteSoignantForm
                soignant={soignant}
                trigger={
                  <Button variant="absolute" size="icon">
                    <Trash className="w-4 h-4 text-red-500" />
                  </Button>
                }
              />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

export default SidebarSoignant
