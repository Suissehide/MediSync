import { useEffect } from 'react'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { useForm } from '@tanstack/react-form'
import dayjs from 'dayjs'
import { Select, TextArea } from '../../ui/input.tsx'
import { TimePicker } from '../../ui/timePicker.tsx'
import type { CreateAppointmentParams } from '../../../types/appointment.ts'
import { usePatientQueries } from '../../../queries/usePatient.ts'
import { generateDurationOptions } from '../../../libs/utils.ts'
import {
  APPOINTMENT_THEMATIC_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
} from '../../../constants/appointment.constant.ts'
import { MultiSelect } from '../../ui/multiSelect.tsx'

interface AddAppointmentFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  startDate: string
  endDate: string
  maxDate: string
  slotID: string
  type: string
  handleCreateAppointment: (newAppointment: CreateAppointmentParams) => void
}

function AddAppointmentForm({
  open,
  setOpen,
  startDate,
  endDate,
  maxDate,
  slotID,
  type,
  handleCreateAppointment,
}: AddAppointmentFormProps) {
  const today = dayjs()
  const patients = usePatientQueries().patients
  const patientOptions =
    patients?.map((patient) => ({
      value: patient.id,
      label: `${patient.firstName} ${patient.lastName}`,
    })) ?? []

  const durationOptions = generateDurationOptions(startDate, maxDate)

  const form = useForm({
    defaultValues: {
      startTime: startDate ? dayjs.utc(startDate) : today,
      duration:
        startDate && endDate
          ? dayjs(endDate).diff(dayjs(startDate), 'minute').toString()
          : '',
      thematic: '',
      type: '',
      transmissionNotes: '',
      patientIDs: [] as string[],
    },
    onSubmit: ({ value }) => {
      const newAppointment: CreateAppointmentParams = {
        startDate: value.startTime.toISOString(),
        endDate: value.startTime
          .add(Number.parseInt(value.duration), 'minute')
          .toISOString(),
        slotID,
        thematic: value.thematic,
        type: value.type,
        transmissionNotes: value.transmissionNotes,
        patientIDs: value.patientIDs,
      }
      handleCreateAppointment(newAppointment)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Nouveau rendez-vous
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="flex flex-col gap-2 max-w-md"
          >
            <div className="flex flex-wrap gap-2 items-center">
              <div className="text-sm font-medium">
                {dayjs(startDate)
                  .format('dddd D MMMM')
                  .replace(/^./, (c) => c.toUpperCase())}
              </div>

              <form.Field name="startTime">
                {(field) => (
                  <FormField className="flex items-center gap-2">
                    <div className="text-sm text-text-light font-medium mb-0">
                      à
                    </div>
                    <div>
                      <TimePicker
                        value={field.state.value}
                        onChange={(time) => field.handleChange(time ?? dayjs())}
                        disabled={type === 'multiple'}
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>

              <form.Field name="duration">
                {(field) => (
                  <FormField className="flex items-center gap-2">
                    <div className="text-sm text-text-light font-medium mb-0">
                      pendant
                    </div>
                    <div>
                      <Select
                        id={field.name}
                        options={durationOptions}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value)}
                        disabled={type === 'multiple'}
                        clearable={false}
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>
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
                      type === 'individual'
                        ? 'Sélectionner un patient'
                        : 'Sélectionner un ou plusieurs patients'
                    }
                    maxSelected={type === 'individual' ? 1 : undefined}
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
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            Ajouter
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddAppointmentForm
