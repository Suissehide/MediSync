import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet.tsx'
import { Loader2Icon } from 'lucide-react'
import dayjs from 'dayjs'
import { useForm } from '@tanstack/react-form'
import { FormField } from '../../ui/formField.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { Label } from '../../ui/label.tsx'
import { Input } from '../../ui/input.tsx'
import { Button } from '../../ui/button.tsx'
import { useEffect } from 'react'
import { formatDuration } from '../../../libs/utils.ts'
import {
  useAppointmentByIDQuery,
  useAppointmentMutations,
} from '../../../queries/useAppointment.ts'
import type { UpdateAppointmentParams } from '../../../types/appointment.ts'

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
  const { isPending, appointment, refetch } = useAppointmentByIDQuery(eventID, {
    enabled: false,
  })
  const { updateAppointment } = useAppointmentMutations()

  const form = useForm({
    defaultValues: {
      accompanying: '',
      status: '',
      rejectionReason: '',
      transmissionNotes: '',
      patientIDs: [],
    },
    onSubmit: ({ value }) => {
      if (!appointment?.id) {
        return
      }

      const updateAppointmentData: UpdateAppointmentParams = {
        id: appointment.id,
        accompanying: value.accompanying,
        status: value.status,
        rejectionReason: value.rejectionReason,
        transmissionNotes: value.transmissionNotes,
        patientIDs: value.patientIDs,
      }

      updateAppointment.mutate(updateAppointmentData)
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
              accompanying: data.accompanying || '',
              status: data.status || '',
              rejectionReason: data.rejectionReason || '',
              transmissionNotes: data.transmissionNotes || '',
              patientIDs: [],
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
            <SheetTitle className="font-bold text-2xl m-0!">Créneau</SheetTitle>
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

                <form.Field name="status">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Présence</Label>
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

                <form.Field name="transmissionNotes">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Notes de transmission</Label>
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
