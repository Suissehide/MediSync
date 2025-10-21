import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../../ui/sheet.tsx'
import { Loader2Icon } from 'lucide-react'
import dayjs from 'dayjs'
import { useForm } from '@tanstack/react-form'
import { FormField } from '../../../ui/formField.tsx'
import { FieldInfo } from '../../../ui/fieldInfo.tsx'
import { Label } from '../../../ui/label.tsx'
import { Input, Select, TextArea } from '../../../ui/input.tsx'
import { Button } from '../../../ui/button.tsx'
import { useEffect } from 'react'
import { formatDuration } from '../../../../libs/utils.ts'
import {
  useAppointmentByIDQuery,
  useAppointmentMutations,
} from '../../../../queries/useAppointment.ts'
import type { UpdateAppointmentParams } from '../../../../types/appointment.ts'
import {
  APPOINTMENT_ACCOMPANYING_OPTIONS,
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_THEMATIC_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
} from '../../../../constants/appointment.constant.ts'
import { MultiSelect } from '../../../ui/multiSelect.tsx'
import { usePatientQueries } from '../../../../queries/usePatient.ts'
import { SLOT } from '../../../../constants/process.constant.ts'
import { useQueryClient } from '@tanstack/react-query'

interface AppointmentSheetProps {
  open: boolean
  setOpen: (openEventId: string) => void
  eventID: string
  handleDeleteEvent?: (eventID: string) => void
}

export default function AppointmentSheet({
  open,
  setOpen,
  eventID,
  handleDeleteEvent,
}: AppointmentSheetProps) {
  const queryClient = useQueryClient()
  const { isPending, appointment, refetch } = useAppointmentByIDQuery(eventID, {
    enabled: false,
  })
  const { updateAppointment } = useAppointmentMutations()
  const patients = usePatientQueries().patients
  const patientOptions =
    patients
      ?.slice()
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
      })) ?? []

  const form = useForm({
    defaultValues: {
      thematic: '',
      type: '',
      accompanying: '',
      status: '',
      rejectionReason: '',
      transmissionNotes: '',
      patientIDs: [] as string[],
    },
    onSubmit: ({ value }) => {
      if (!appointment?.id) {
        return
      }

      const updateAppointmentData: UpdateAppointmentParams = {
        id: appointment.id,
        thematic: value.thematic,
        type: value.type,
        accompanying: value.accompanying,
        status: value.status,
        rejectionReason: value.rejectionReason,
        transmissionNotes: value.transmissionNotes,
        patientIDs: value.patientIDs,
      }

      updateAppointment.mutate(updateAppointmentData, {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
        },
      })
      setOpen('')
    },
  })

  const handleDelete = () => {
    if (appointment) {
      handleDeleteEvent?.(appointment.id)
      setOpen('')
    }
  }

  useEffect(() => {
    if (open) {
      refetch().then(({ data }) => {
        if (data) {
          form.reset(
            {
              thematic: data.thematic || '',
              type: data.type || '',
              accompanying: data.accompanying || '',
              status: data.status || '',
              rejectionReason: data.rejectionReason || '',
              transmissionNotes: data.transmissionNotes || '',
              patientIDs: data.patients.map((p) => p.id),
            },
            { keepDefaultValues: true },
          )
        }
      })
    }
  }, [open, form, refetch])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? eventID : '')}
    >
      <SheetContent>
        <SheetHeader className="flex flex-row justify-between items-center mb-6">
          <div className="m-0">
            <SheetTitle className="font-bold text-2xl m-0!">
              Rendez-vous
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="h-full">
          {isPending ? (
            <div className="h-full flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await form.validate('submit')
                  await form.handleSubmit()
                }}
                className="flex flex-col gap-2 max-w-md"
              >
                <div className="flex">
                  {`Le ${dayjs(appointment?.startDate).format('dddd D MMMM à hh:mm')} ${formatDuration(appointment?.startDate, appointment?.endDate)}`}
                </div>

                <form.Field name="thematic">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Thématique</Label>
                      <Select
                        id={field.name}
                        options={APPOINTMENT_THEMATIC_OPTIONS}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="type">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Type</Label>
                      <Select
                        id={field.name}
                        options={APPOINTMENT_TYPE_OPTIONS}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="status">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Présence</Label>
                      <Select
                        id={field.name}
                        options={APPOINTMENT_STATUS_OPTIONS}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="accompanying">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Présence</Label>
                      <Select
                        id={field.name}
                        options={APPOINTMENT_ACCOMPANYING_OPTIONS}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="rejectionReason">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Motif de refus</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field
                  name="patientIDs"
                  validators={{
                    onSubmit: ({ value }) => {
                      if (!value.length) {
                        return 'Au moins un patient est requis'
                      }
                      return undefined
                    },
                  }}
                >
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Patients</Label>
                      <MultiSelect
                        options={patientOptions}
                        value={field.state.value}
                        onChange={(val) => field.handleChange(val)}
                        placeholder={
                          appointment?.type === 'individual'
                            ? 'Sélectionner un patient'
                            : 'Sélectionner un ou plusieurs patients'
                        }
                        maxSelected={
                          appointment?.type === 'individual' ? 1 : undefined
                        }
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="transmissionNotes">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Notes de transmission</Label>
                      <TextArea
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>
              </form>

              <div className="flex justify-between gap-4 mt-4">
                <div>
                  <Button variant="destructive" onClick={() => handleDelete()}>
                    Supprimer
                  </Button>
                </div>
                <div className="flex gap-4">
                  <Button variant="default" onClick={() => form.handleSubmit()}>
                    Mettre à jour
                  </Button>
                  <Button variant="secondary" onClick={() => setOpen('')}>
                    Annuler
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
