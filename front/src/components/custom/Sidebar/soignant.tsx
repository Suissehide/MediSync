import { Plus, Stethoscope } from 'lucide-react'
import { useEffect } from 'react'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'

function SidebarSoignant() {
  const selectedSoignantId = useSoignantStore(
    (state) => state.selectedSoignantId,
  )
  const soignants = useSoignantStore((state) => state.soignants)
  const selectSoignant = useSoignantStore((state) => state.selectSoignant)

  const handleSelectSoignant = (soignantID: string) => {
    selectSoignant(soignantID)
  }

  useEffect(() => {
    if (!selectedSoignantId && soignants.length > 0) {
      selectSoignant(soignants[0].id)
    }
  }, [selectedSoignantId, soignants, selectSoignant])

  return (
    <>
      <div className="flex justify-between items-center text-text-light px-2 mb-2">
        <p>Soignants</p>
        <button type="button" className="cursor-pointer">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <ol className="">
        {soignants.map((soignant) => (
          <li key={soignant.id}>
            <button
              className={`cursor-pointer w-full py-2 pl-2 flex items-center gap-2 rounded-lg ${selectedSoignantId === soignant.id ? 'bg-primary/10' : ''} hover:bg-primary/15`}
              type="button"
              onClick={() => handleSelectSoignant(soignant.id)}
            >
              <Stethoscope className="w-5 h-5" />
              {soignant.name}
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}

export default SidebarSoignant
