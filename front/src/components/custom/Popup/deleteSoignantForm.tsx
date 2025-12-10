import { Check, Trash, X } from 'lucide-react'
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

interface DeleteSoignantFormProps {
  soignant: Soignant
}

function DeleteSoignantForm({ soignant }: DeleteSoignantFormProps) {
  const [open, setOpen] = useState(false)
  const { deleteSoignant } = useSoignantMutations()

  const handleDelete = () => {
    deleteSoignant.mutate(soignant.id)
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger variant="absolute" size="icon" asChild>
        <Button type="button" onClick={() => setOpen(true)}>
          <Trash className="w-4 h-4 text-red-500" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Confirmation
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div>Voulez-vous supprimer ce soignant : {soignant.name} ?</div>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => handleDelete()}>
            <Check className="w-4 h-4" />
            Supprimer
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default DeleteSoignantForm
