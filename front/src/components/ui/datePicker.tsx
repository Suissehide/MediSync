import {
  DatePicker as MuiDatePicker,
  type DatePickerProps as MuiDatePickerProps,
} from '@mui/x-date-pickers'
import { clsx } from 'clsx'
import { CalendarDays } from 'lucide-react'

interface DatePickerProps extends MuiDatePickerProps {
  className?: string
  label?: string
}

export const DatePicker = ({
  value,
  onChange,
  label,
  className = '',
  slots,
  ...props
}: DatePickerProps) => {
  return (
    <MuiDatePicker
      value={value}
      onChange={onChange}
      label={label}
      timezone="UTC"
      slots={{
        openPickerIcon: () => <CalendarDays className="h-4 w-4 text-primary" />,
        ...slots,
      }}
      {...props}
      slotProps={{
        textField: {
          variant: 'outlined',
          sx: {
            '& .MuiOutlinedInput-root': {
              flexDirection: 'row',
            },
            '& .MuiInputAdornment-root': {
              order: -1,
              marginLeft: '-4px',
              marginRight: '18px',
            },
            '& .MuiIconButton-root': {
              padding: '2px',
              color: 'inherit',
            },
          },
          slotProps: {
            input: {
              className: clsx(
                'h-[36px] text-sm bg-background border border-border rounded-md shadow-none',
                className,
              ),
              classes: { notchedOutline: 'border-none' },
            },
          },
        },
        popper: {
          placement: 'bottom-start',
          disablePortal: true,
          // Limite = l'écran : sinon un conteneur scrollable (corps de popup) fait basculer le calendrier au-dessus.
          modifiers: [
            {
              name: 'flip',
              enabled: true,
              options: { boundary: document.body },
            },
            {
              name: 'preventOverflow',
              enabled: true,
              options: { altAxis: true, boundary: document.body },
            },
          ],
        },
      }}
    />
  )
}
