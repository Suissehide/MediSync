import { Popover } from '@mui/material'
import { DateCalendar } from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import type { Dispatch, SetStateAction } from 'react'

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
  const handleClose = () => setAnchorEl(null)

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <div style={{ padding: 16 }}>
        <DateCalendar onChange={onChange} defaultValue={dayjs()} />
      </div>
    </Popover>
  )
}
