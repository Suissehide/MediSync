import { DateCalendar } from '@mui/x-date-pickers'
import { createFileRoute } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getDayAppointmentColumns } from '@/columns/dayAppointment.column.tsx'
import { DATE_CALENDAR_SX } from '@/components/custom/Calendar/calendarDatePickerButton.tsx'
import AddAppointmentForm from '@/components/custom/popup/addAppointmentForm.tsx'
import AddPatientForm from '@/components/custom/popup/addPatientForm.tsx'
import AddPatientToAppointmentForm from '@/components/custom/popup/addPatientToAppointmentForm.tsx'
import AddPatientToSlotForm from '@/components/custom/popup/addPatientToSlotForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import AppointmentSheet from '@/components/custom/sheet/appointmentSheet.tsx'
import WeekDayStrip from '@/components/custom/weekDayStrip.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Etiquette } from '@/components/table/etiquette.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { styleSoignant } from '@/libs/color.ts'
import { getFreeIntervals } from '@/libs/slotAvailability.ts'
import { buildDaySlotRows, type DaySlotRow } from '@/libs/utils.ts'
import { useAppointmentMutations } from '@/queries/useAppointment.ts'
import { useSlotsInRangeQuery } from '@/queries/useSlot.ts'
import { useSoignantStore } from '@/store/useSoignantStore.ts'
import type { Slot } from '@/types/slot.ts'
import type { Soignant } from '@/types/soignant.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/agenda',
)({
  component: Agenda,
})

const SELECTED_DAY_STORAGE_KEY = 'agenda/selected-day'

// Popup « Nouveau rendez-vous » du Planning : sur l'intervalle libre choisi, le
// premier intervalle libre d'un créneau individuel, ou le créneau collectif entier.
const getBookingInterval = (row: DaySlotRow, slot: Slot) => {
  if (row.kind === 'free') {
    return { start: row.startDate, end: row.endDate }
  }
  return row.isIndividual
    ? getFreeIntervals(slot)[0]
    : { start: slot.startDate, end: slot.endDate }
}

const getNewAppointmentProps = (row: DaySlotRow | null, slot?: Slot) => {
  if (!row || !slot || (row.appointmentId && !row.isIndividual)) {
    return null
  }
  const interval = getBookingInterval(row, slot)
  if (!interval) {
    return null
  }
  return {
    slotID: slot.id,
    startDate: interval.start,
    endDate: interval.end,
    maxDate: interval.end,
    soignants: row.soignants,
    type: row.isIndividual ? 'individual' : 'multiple',
  }
}

function Agenda() {
  const [selectedDay, setSelectedDay] = useState(() => {
    const stored = localStorage.getItem(SELECTED_DAY_STORAGE_KEY)
    const parsed = stored ? dayjs.utc(stored) : null

    return parsed?.isValid()
      ? parsed.startOf('day')
      : dayjs.utc().startOf('day')
  })
  const [openedRow, setOpenedRow] = useState<DaySlotRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DaySlotRow | null>(null)
  const [addPatientTargetId, setAddPatientTargetId] = useState<string | null>(
    null,
  )

  const handleDayChange = (day: Dayjs) => {
    setSelectedDay(day)
    localStorage.setItem(SELECTED_DAY_STORAGE_KEY, day.format('YYYY-MM-DD'))
  }

  const today = dayjs.utc().startOf('day')

  // `to` exclusive : le lendemain, sinon la journée serait amputée.
  const dayRange = useMemo(
    () => ({
      from: selectedDay.utc().format('YYYY-MM-DD'),
      to: selectedDay.utc().add(1, 'day').format('YYYY-MM-DD'),
    }),
    [selectedDay],
  )
  const { slots, isPending } = useSlotsInRangeQuery(dayRange)
  const { createAppointment, deleteAppointment, updateAppointment } =
    useAppointmentMutations()
  const selectedSoignantIDs = useSoignantStore(
    (state) => state.selectedSoignantIDs,
  )
  const soignants = useSoignantStore((state) => state.soignants)
  const soignantIDs = useMemo(() => soignants.map((s) => s.id), [soignants])

  const rows = useMemo(
    () => buildDaySlotRows(slots, selectedDay),
    [slots, selectedDay],
  )

  // Un tableau par soignant (un créneau partagé apparaît dans chacun), limité
  // aux soignants cochés dans la barre latérale s'il y en a.
  const groups = useMemo(() => {
    const isShown = (id: string) =>
      selectedSoignantIDs.length === 0 || selectedSoignantIDs.includes(id)
    const bySoignant = new Map(
      rows.flatMap((row) => row.soignants).map((s) => [s.id, s]),
    )
    const result = [...bySoignant.values()]
      .filter((soignant) => isShown(soignant.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((soignant) => ({
        soignant: soignant as Soignant | null,
        rows: rows.filter((row) =>
          row.soignants.some((s) => s.id === soignant.id),
        ),
      }))
    const withoutSoignant = rows.filter((row) => row.soignants.length === 0)
    if (selectedSoignantIDs.length === 0 && withoutSoignant.length > 0) {
      result.push({ soignant: null, rows: withoutSoignant })
    }
    return result
  }, [rows, selectedSoignantIDs])

  const addPatientTarget =
    rows
      .flatMap((row) => [row, ...(row.subRows ?? [])])
      .find((row) => row.id === addPatientTargetId) ?? null
  const newAppointment = getNewAppointmentProps(
    addPatientTarget,
    slots?.find((slot) => slot.id === addPatientTarget?.slotId),
  )

  const columns = useMemo(
    () =>
      getDayAppointmentColumns({
        onOpen: (row) => setOpenedRow(row),
        onDelete: (row) => setDeleteTarget(row),
        onAddPatient: (row) => setAddPatientTargetId(row.id),
        soignantIDs,
      }),
    [soignantIDs],
  )

  return (
    <DashboardLayout
      components={['soignant']}
      quickActions={[
        <AddPatientForm key="add-patient" />,
        <AddPatientToSlotForm key="add-patient-to-slot" />,
      ]}
    >
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="min-h-9 flex justify-between items-center gap-3 flex-wrap">
          <div className="self-start min-h-9 flex gap-2 items-center">
            <div className="flex items-center justify-center bg-foreground p-2 rounded-full">
              <CalendarDays className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-text-dark text-xl font-semibold">
              {selectedDay
                .format('dddd D MMMM YYYY')
                .replace(/^./, (c) => c.toUpperCase())}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleDayChange(today)}
              className={
                selectedDay.isSame(today, 'day')
                  ? 'invisible pointer-events-none'
                  : undefined
              }
            >
              Aujourd&apos;hui
            </Button>

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Choisir une date"
                >
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-auto">
                <DateCalendar
                  sx={DATE_CALENDAR_SX}
                  value={selectedDay}
                  onChange={(newDate) => {
                    if (newDate) {
                      handleDayChange(
                        dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day'),
                      )
                    }
                  }}
                />
              </PopoverContent>
            </PopoverRoot>

            <WeekDayStrip value={selectedDay} onChange={handleDayChange} />
          </div>
        </div>

        {isPending || groups.length === 0 ? (
          <ReactTable<DaySlotRow>
            data={[]}
            columns={columns}
            filterId="day-appointment"
            isLoading={isPending}
            emptyState="Aucun créneau ce jour-là"
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6">
            {groups.map(({ soignant, rows: soignantRows }) => (
              <section
                key={soignant?.id ?? 'sans-soignant'}
                className="shrink-0 flex flex-col gap-2"
              >
                <h2>
                  {soignant ? (
                    <Etiquette style={styleSoignant(soignant.id, soignantIDs)}>
                      {soignant.name}
                    </Etiquette>
                  ) : (
                    <Etiquette ton="neutre">Sans soignant</Etiquette>
                  )}
                </h2>
                <ReactTable<DaySlotRow>
                  data={soignantRows}
                  columns={columns}
                  getSubRows={(row) => row.subRows}
                  filterId="day-appointment"
                  onRowClick={(row) => row.appointmentId && setOpenedRow(row)}
                  autoRowHeight
                />
              </section>
            ))}
          </div>
        )}

        {openedRow?.appointmentId && (
          <AppointmentSheet
            open={!!openedRow}
            setOpen={() => setOpenedRow(null)}
            eventID={openedRow.appointmentId}
            soignants={openedRow.soignants}
          />
        )}

        {addPatientTarget?.appointmentId && !addPatientTarget.isIndividual && (
          <AddPatientToAppointmentForm
            open
            setOpen={(open) => {
              if (!open) {
                setAddPatientTargetId(null)
              }
            }}
            row={addPatientTarget}
            isPending={updateAppointment.isPending}
            onConfirm={(params) => {
              updateAppointment.mutate(params)
              setAddPatientTargetId(null)
            }}
            onRequestDelete={() => {
              setDeleteTarget(addPatientTarget)
              setAddPatientTargetId(null)
            }}
          />
        )}

        {newAppointment && (
          <AddAppointmentForm
            open
            setOpen={(open) => {
              if (!open) {
                setAddPatientTargetId(null)
              }
            }}
            {...newAppointment}
            handleCreateAppointment={(params) => {
              createAppointment.mutate(params)
              setAddPatientTargetId(null)
            }}
            isPending={createAppointment.isPending}
          />
        )}

        <ConfirmDeleteForm
          open={!!deleteTarget}
          setOpen={(open) => {
            if (!open) {
              setDeleteTarget(null)
            }
          }}
          onConfirm={() => {
            if (deleteTarget?.appointmentId) {
              deleteAppointment.mutate(deleteTarget.appointmentId)
            }
            setDeleteTarget(null)
          }}
          loading={deleteAppointment.isPending}
          title="Supprimer le rendez-vous"
          description="Voulez-vous vraiment supprimer ce rendez-vous ? Cette action est irréversible."
        />
      </div>
    </DashboardLayout>
  )
}
