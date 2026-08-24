import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getDayAppointmentColumns } from '../../columns/dayAppointment.column.tsx'
import AddPatientToAppointmentForm from '../../components/custom/popup/addPatientToAppointmentForm.tsx'
import { ConfirmDeleteForm } from '../../components/custom/popup/confirmDeleteForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import WeekDayStrip from '../../components/custom/weekDayStrip.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
import {
  buildDayAppointmentRows,
  type DayAppointmentRow,
} from '../../libs/utils.ts'
import { useAppointmentMutations } from '../../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../../queries/useSlot.ts'

export const Route = createFileRoute('/_authenticated/agenda')({
  component: Agenda,
})

function Agenda() {
  const [selectedDay, setSelectedDay] = useState(() =>
    dayjs.utc().startOf('day'),
  )
  const [openedRow, setOpenedRow] = useState<DayAppointmentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DayAppointmentRow | null>(
    null,
  )
  const [addPatientTargetId, setAddPatientTargetId] = useState<string | null>(
    null,
  )

  const { slots, isPending } = useAllSlotsQuery()
  const { deleteAppointment, updateAppointment } = useAppointmentMutations()

  const rows = useMemo(
    () => buildDayAppointmentRows(slots, selectedDay),
    [slots, selectedDay],
  )

  const addPatientTarget = rows.find((row) => row.id === addPatientTargetId) ?? null

  const columns = useMemo(
    () =>
      getDayAppointmentColumns({
        onOpen: (row) => setOpenedRow(row),
        onDelete: (row) => setDeleteTarget(row),
        onAddPatient: (row) => setAddPatientTargetId(row.id),
      }),
    [],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex gap-2 items-center">
            <div className="flex items-center justify-center bg-foreground p-2 rounded-full">
              <CalendarDays className="h-4 w-4 text-white" />
            </div>
            <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
              {selectedDay
                .format('dddd D MMMM YYYY')
                .replace(/^./, (c) => c.toUpperCase())}
            </h1>
          </div>

          <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />
        </div>

        <ReactTable<DayAppointmentRow>
          data={rows}
          columns={columns}
          filterId="day-appointment"
          isLoading={isPending}
          emptyState="Aucun rendez-vous ce jour-là"
        />

        {openedRow && (
          <AppointmentSheet
            open={!!openedRow}
            setOpen={() => setOpenedRow(null)}
            eventID={openedRow.id}
            soignants={openedRow.soignants}
          />
        )}

        {addPatientTarget && (
          <AddPatientToAppointmentForm
            open={!!addPatientTarget}
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
            if (deleteTarget) {
              deleteAppointment.mutate(deleteTarget.id)
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
