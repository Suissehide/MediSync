import { DateCalendar, PickersDay, type PickersDayProps } from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { useState } from 'react'

dayjs.extend(isoWeek)

interface WeekPickerProps {
  value: Dayjs | null
  onChange: (date: Dayjs | null) => void
}

interface WeekDayExtraProps {
  selectedWeekStart: Dayjs | null
  hoveredWeekStart: Dayjs | null
}

function WeekDay(props: PickersDayProps & WeekDayExtraProps) {
  const { day, selectedWeekStart, hoveredWeekStart, ...other } = props

  const isInSelectedWeek =
    selectedWeekStart && day.isSame(selectedWeekStart, 'week')

  const isInHoveredWeek =
    hoveredWeekStart && !isInSelectedWeek && day.isSame(hoveredWeekStart, 'week')

  const isWeekStart = day.isoWeekday() === 1
  const isWeekEnd = day.isoWeekday() === 5
  const isWeekend = day.isoWeekday() > 5

  return (
    <PickersDay
      {...other}
      day={day}
      disableMargin
      selected={false}
      sx={{
        borderRadius: 0,
        transition: 'background-color 0.15s ease, color 0.15s ease',
        ...(isWeekStart && {
          borderTopLeftRadius: '20%',
          borderBottomLeftRadius: '20%',
        }),
        ...(isWeekEnd && {
          borderTopRightRadius: '20%',
          borderBottomRightRadius: '20%',
        }),
        ...(isInSelectedWeek &&
          !isWeekend && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 18%, transparent) !important',
            color: 'var(--primary) !important',
            fontWeight: '600 !important',
            '&:hover': {
              backgroundColor:
                'color-mix(in srgb, var(--primary) 25%, transparent) !important',
            },
          }),
        ...(isInHoveredWeek &&
          !isWeekend && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 8%, transparent)',
          }),
        ...(isWeekend &&
          isInSelectedWeek && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 8%, transparent) !important',
            color: 'var(--primary) !important',
          }),
        ...(isWeekend &&
          isInHoveredWeek && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 4%, transparent)',
          }),
      }}
    />
  )
}

export function WeekPicker({ value, onChange }: WeekPickerProps) {
  const [hoveredDay, setHoveredDay] = useState<Dayjs | null>(null)

  const selectedWeekStart = value ? value.isoWeekday(1) : null
  const hoveredWeekStart = hoveredDay ? hoveredDay.isoWeekday(1) : null

  const selectPrevWeek = () => {
    const base = value ?? dayjs()
    onChange(base.isoWeekday(1).subtract(7, 'day'))
  }

  const selectNextWeek = () => {
    const base = value ?? dayjs()
    onChange(base.isoWeekday(1).add(7, 'day'))
  }

  return (
    <div className="flex items-start">
      <DateCalendar
        value={value}
        onChange={(date) => onChange(date)}
        showDaysOutsideCurrentMonth
        slots={{ day: WeekDay as React.ComponentType<PickersDayProps> }}
        slotProps={{
          day: ((ownerState: PickersDayProps) => ({
            selectedWeekStart,
            hoveredWeekStart,
            onPointerEnter: () => setHoveredDay(ownerState.day),
            onPointerLeave: () => setHoveredDay(null),
          })) as never,
        }}
        sx={{
          margin: 0,
          width: 280,
          '& .MuiPickersCalendarHeader-root': { paddingLeft: '16px', paddingRight: '8px' },
        }}
      />

      <div className="self-stretch w-px bg-border mx-1" />

      <div className="flex flex-col gap-2 pt-14 pl-3">
        <button
          type="button"
          onClick={selectPrevWeek}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-dark hover:bg-muted transition-colors cursor-pointer whitespace-nowrap"
        >
          Semaine précédente
        </button>
        <button
          type="button"
          onClick={selectNextWeek}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-dark hover:bg-muted transition-colors cursor-pointer whitespace-nowrap"
        >
          Semaine suivante
        </button>
      </div>
    </div>
  )
}
