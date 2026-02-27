import { DateCalendar } from '@mui/x-date-pickers'
import { createFileRoute } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'

import DashboardLayout from '../../components/dashboard.layout.tsx'
import { Button } from '../../components/ui/button.tsx'
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '../../components/ui/popover.tsx'
import { hexToRgba } from '../../libs/utils.ts'
import { usePathwayTrackingQuery } from '../../queries/usePathway.ts'
import type { TrackingPathway } from '../../types/pathway.ts'

export const Route = createFileRoute('/_authenticated/suivi')({
  component: SuiviPage,
})

function SuiviPage() {
  const [date, setDate] = useState<Dayjs>(dayjs())

  const { trackingPathways, isPending } = usePathwayTrackingQuery(
    date.year(),
    date.month() + 1,
  )

  const daysInMonth = date.daysInMonth()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const prevMonth = () => setDate((d) => d.subtract(1, 'month'))
  const nextMonth = () => setDate((d) => d.add(1, 'month'))

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background rounded-lg flex flex-col w-full gap-4">
        <div className="p-6 flex justify-between items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold">Suivi</h1>

          <div className="flex items-center gap-1">
            <Button variant="none" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <span className="min-w-36 text-center font-medium capitalize">
              {date.format('MMMM YYYY')}
            </span>

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button type="button" variant="none" size="icon">
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="p-0 w-auto">
                <DateCalendar
                  views={['year', 'month']}
                  openTo="month"
                  value={date}
                  onChange={(newDate) => {
                    if (newDate) {
                      setDate(newDate)
                    }
                  }}
                />
              </PopoverContent>
            </PopoverRoot>

            <Button variant="none" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {isPending ? (
          <div className="text-center text-text-light text-sm px-6">
            Chargement...
          </div>
        ) : !trackingPathways || trackingPathways.length === 0 ? (
          <div className="text-center text-text-light text-sm">
            Aucun parcours ce mois-ci.
          </div>
        ) : (
          <div className="px-6 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-foreground border-b border-border">
                  <th className="sticky left-0 z-10 bg-foreground text-left px-3 py-2 font-medium text-text min-w-40 border-r border-border">
                    Patient
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="px-1 py-2 font-medium text-text-light text-center min-w-8 w-8"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trackingPathways.map((pathway) => (
                  <PathwayRows key={pathway.id} pathway={pathway} days={days} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function PathwayRows({
  pathway,
  days,
}: {
  pathway: TrackingPathway
  days: number[]
}) {
  const color = pathway.template?.color ?? '#6366f1'
  const name = pathway.template?.name ?? 'Parcours sans modèle'

  return (
    <>
      <tr>
        <td
          colSpan={days.length + 1}
          className="px-3 py-1.5 font-semibold text-sm border-b border-border"
          style={{ backgroundColor: hexToRgba(color, 0.15) }}
        >
          <span
            className="inline-block w-3 h-3 rounded-full mr-2 align-middle"
            style={{ backgroundColor: color }}
          />
          {name}
        </td>
      </tr>
      {pathway.patients.length === 0 ? (
        <tr>
          <td
            colSpan={days.length + 1}
            className="px-3 py-2 text-text-light italic border-b border-border"
          >
            Aucun patient
          </td>
        </tr>
      ) : (
        pathway.patients.map((patient) => {
          const appointmentByDay = new Map<number, { status: string | null }>()
          for (const apt of patient.appointments) {
            appointmentByDay.set(dayjs(apt.date).date(), { status: apt.status })
          }

          return (
            <tr
              key={patient.id}
              className="border-b border-border hover:bg-primary/5"
            >
              <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-text border-r border-border whitespace-nowrap">
                {patient.firstName} {patient.lastName}
              </td>
              {days.map((d) => {
                const apt = appointmentByDay.get(d)
                return (
                  <td
                    key={d}
                    className="px-0.5 py-1 text-center"
                    style={
                      apt
                        ? { backgroundColor: hexToRgba(color, 0.35) }
                        : undefined
                    }
                  >
                    {apt?.status != null && (
                      <X className="w-3 h-3 mx-auto text-red-600" />
                    )}
                  </td>
                )
              })}
            </tr>
          )
        })
      )}
    </>
  )
}
