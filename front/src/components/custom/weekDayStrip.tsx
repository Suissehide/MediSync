import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../../libs/utils.ts'
import { Button } from '../ui/button.tsx'

type WeekDayStripProps = {
  value: Dayjs
  onChange: (day: Dayjs) => void
}

export default function WeekDayStrip({ value, onChange }: WeekDayStripProps) {
  const weekStart = value.isoWeekday(1).startOf('day')
  const days = Array.from({ length: 7 }, (_, index) =>
    weekStart.add(index, 'day'),
  )
  const today = dayjs.utc().startOf('day')
  const isOnToday = value.isSame(today, 'day')

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Semaine précédente"
        onClick={() => onChange(value.subtract(7, 'day'))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-1">
        {days.map((day) => {
          const isSelected = day.isSame(value, 'day')
          const isCurrentDay = day.isSame(today, 'day')

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange(day)}
              aria-current={isSelected ? 'date' : undefined}
              className={cn(
                'flex flex-col items-center min-w-[56px] rounded-lg px-3 py-1 cursor-pointer transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-light hover:bg-card',
              )}
            >
              <span className="text-xs capitalize">{day.format('ddd')}</span>
              <span className="text-sm font-medium">{day.format('D')}</span>
              <span
                className={cn(
                  'mt-0.5 h-1 w-1 rounded-full',
                  !isCurrentDay && 'bg-transparent',
                  isCurrentDay && !isSelected && 'bg-primary',
                  isCurrentDay && isSelected && 'bg-primary-foreground',
                )}
              />
            </button>
          )
        })}
      </div>

      <Button
        variant="outline"
        size="icon"
        aria-label="Semaine suivante"
        onClick={() => onChange(value.add(7, 'day'))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isOnToday && (
        <Button variant="outline" onClick={() => onChange(today)}>
          Aujourd&apos;hui
        </Button>
      )}
    </div>
  )
}
