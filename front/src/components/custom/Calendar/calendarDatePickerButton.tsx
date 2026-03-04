import { DateCalendar } from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import type { Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  anchorEl: HTMLElement | null
  setAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>
  onChange: (date: Dayjs | null) => void
}

export default function CalendarDatePickerButton({
  anchorEl,
  setAnchorEl,
  onChange,
}: Props) {
  if (!anchorEl) return null

  const rect = anchorEl.getBoundingClientRect()

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[199]"
        onClick={() => setAnchorEl(null)}
      />
      <div
        style={{
          position: 'fixed',
          top: rect.bottom + 8,
          left: rect.left,
          zIndex: 200,
        }}
        className="rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
      >
        <DateCalendar onChange={onChange} defaultValue={dayjs()} />
      </div>
    </>,
    document.body,
  )
}
