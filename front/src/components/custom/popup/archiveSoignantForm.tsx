import { Archive, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

import { useSoignantMutations } from '../../../queries/useSoignant.ts'
import type { Soignant } from '../../../types/soignant.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'

interface ArchiveSoignantFormProps {
  soignant: Soignant
  trigger?: React.ReactNode
}

function ArchiveSoignantForm({ soignant, trigger }: ArchiveSoignantFormProps) {
  const [open, setOpen] = useState(false)
  const { archiveSoignant } = useSoignantMutations()

  const handleArchive = () => {
    archiveSoignant.mutate(soignant.id)
    setOpen(false)
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="absolute" size="icon" onClick={() => setOpen(true)}>
            <Archive className="w-4 h-4 text-red-500" />
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Archiver le soignant
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">
            {soignant.name} sort des listes de choix. Les créneaux, thématiques
            et tâches qui le portent le conservent, et il se restaure depuis le
            filtre « Archivés ».
          </p>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="outline"
            onClick={handleArchive}
            disabled={archiveSoignant.isPending}
          >
            <Archive className="w-4 h-4" />
            {archiveSoignant.isPending ? 'Archivage...' : 'Archiver'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default ArchiveSoignantForm
