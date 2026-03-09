import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import { CalendarX, X } from 'lucide-react'

import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface CreateForbiddenWeekFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  date: string | null
  onConfirm: (date: string) => void
  loading?: boolean
}

export function CreateForbiddenWeekForm({
  open,
  setOpen,
  date,
  onConfirm,
  loading = false,
}: CreateForbiddenWeekFormProps) {
  const weekLabel = date
    ? dayjs(date).locale('fr').isoWeekday(1).format('DD MMMM YYYY')
    : ''

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">Semaine interdite</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">
            Marquer la semaine du{' '}
            <span className="font-medium text-text">{weekLabel}</span> comme
            interdite ? Aucun slot ne pourra être planifié sur cette semaine.
          </p>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="outline"
            onClick={() => date && onConfirm(date)}
            disabled={loading}
          >
            <CalendarX className="w-4 h-4" />
            {loading ? 'En cours...' : 'Confirmer'}
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
