import dayjs from 'dayjs'
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
  const weekStart = startOfWeek ? dayjs(startOfWeek).isoWeekday(1) : null
  const weekStartLabel = weekStart ? weekStart.format('DD MMMM YYYY') : ''
  const weekEndLabel = weekStart ? weekStart.add(6, 'day').format('DD MMMM YYYY') : ''

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
            <span className="font-medium text-text">{weekStartLabel}</span> au{' '}
            <span className="font-medium text-text">{weekEndLabel}</span> ?
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
