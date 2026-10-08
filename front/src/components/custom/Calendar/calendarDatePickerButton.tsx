import { DateCalendar } from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import type { Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

// Aujourd'hui reste bien visible à côté de la date sélectionnée.
export const DATE_CALENDAR_SX = {
  '& .MuiPickersDay-today:not(.Mui-selected)': {
    borderColor: 'var(--primary)',
    color: 'var(--primary)',
    fontWeight: 600,
  },
}

interface Props {
  anchorEl: HTMLElement | null
  setAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>
  onChange: (date: Dayjs | null) => void
  /** Date affichée par le calendrier, présélectionnée à l'ouverture. */
  value?: Dayjs
}

export default function CalendarDatePickerButton({
  anchorEl,
  setAnchorEl,
  onChange,
  value,
}: Props) {
  if (!anchorEl) {
    return null
  }

  const rect = anchorEl.getBoundingClientRect()

  return createPortal(
    <>
      {/* Voile de fermeture : un vrai bouton, donc atteignable au clavier. */}
      <button
        type="button"
        aria-label="Fermer le selecteur de date"
        className="fixed inset-0 z-[199]"
        onClick={() => setAnchorEl(null)}
      />
      <div
        style={{
          position: 'fixed',
          top: rect.bottom + 8,
          // Aligné sur le bord droit du bouton : il est en bout de barre.
          right: window.innerWidth - rect.right,
          zIndex: 200,
        }}
        className="rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
      >
        <DateCalendar
          onChange={onChange}
          defaultValue={value ?? dayjs.utc()}
          timezone="UTC"
          sx={DATE_CALENDAR_SX}
        />
      </div>
    </>,
    document.body,
  )
}
