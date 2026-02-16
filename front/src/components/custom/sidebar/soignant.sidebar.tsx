import { Stethoscope } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import type { User } from '../../../types/auth.ts'
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
      <div className="flex justify-between items-center text-text-light pl-2 mb-2">
        <p>Soignants</p>
        {isAdmin && <AddSoignantForm />}
      </div>
      <ul className="flex-1 flex flex-col min-h-0 overflow-y-auto border-b border-border pb-2">
        {soignants.map((soignant) => (
          <li
            key={soignant.id}
            onMouseEnter={() => setIsHovered(soignant.id)}
            onMouseLeave={() => setIsHovered('')}
            className={`w-full flex justify-between items-center gap-2 rounded-lg ${selectedSoignantID === soignant.id ? 'bg-primary/10' : ''} hover:bg-primary/15`}
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
              <DeleteSoignantForm soignant={soignant} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

export default SidebarSoignant
