import { Trash, X } from 'lucide-react'

import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface ConfirmDeleteFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  onConfirm: () => void
  loading?: boolean
  title?: string
  description?: React.ReactNode
  // Les trois valeurs par defaut decrivent une suppression : seul un appelant
  // qui confirme autre chose (un archivage) a besoin de les changer.
  confirmLabel?: string
  confirmLoadingLabel?: string
  confirmIcon?: React.ReactNode
}

export function ConfirmDeleteForm({
  open,
  setOpen,
  onConfirm,
  loading = false,
  title = 'Confirmation de suppression',
  description = 'Voulez-vous vraiment supprimer cet élément ? Cette action est irréversible.',
  confirmLabel = 'Supprimer',
  confirmLoadingLabel = 'Suppression...',
  confirmIcon = <Trash className="w-4 h-4 text-destructive" />,
}: ConfirmDeleteFormProps) {
  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">{title}</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">{description}</p>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button variant="outline" onClick={onConfirm} disabled={loading}>
            {confirmIcon}
            {loading ? confirmLoadingLabel : confirmLabel}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
