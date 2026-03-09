import dayjs from 'dayjs'
import 'dayjs/locale/fr'
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

interface DeleteForbiddenWeekFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  startOfWeek: string | null
  onConfirm: () => void
  loading?: boolean
}

export function DeleteForbiddenWeekForm({
  open,
  setOpen,
  startOfWeek,
  onConfirm,
  loading = false,
}: DeleteForbiddenWeekFormProps) {
  const weekLabel = startOfWeek
    ? dayjs(startOfWeek).locale('fr').format('DD MMMM YYYY')
    : ''

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Retirer l'interdiction
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">
            Retirer l'interdiction de la semaine du{' '}
            <span className="font-medium text-text">{weekLabel}</span> ?
          </p>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={onConfirm} disabled={loading}>
            <Trash className="w-4 h-4 text-destructive" />
            {loading ? 'En cours...' : 'Retirer'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
