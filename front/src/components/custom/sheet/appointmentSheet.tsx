import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  ChevronDown,
  ChevronUp,
  FilePlus,
  Loader2Icon,
  TrashIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  APPOINTMENT_ACCOMPANYING_OPTIONS,
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
} from '../../../constants/appointment.constant.ts'
import { SLOT } from '../../../constants/process.constant.ts'
import {
  getThemeOptionsByRole,
  THEMATICS,
} from '../../../constants/slot.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { formatDuration } from '../../../libs/utils.ts'
import {
  useAppointmentByIDQuery,
  useAppointmentMutations,
} from '../../../queries/useAppointment.ts'
import { usePatientQueries } from '../../../queries/usePatient.ts'
import type { UpdateAppointmentParams } from '../../../types/appointment.ts'
import type { Soignant } from '../../../types/soignant.ts'
import { Button } from '../../ui/button.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Input, Select } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet.tsx'

interface AppointmentSheetProps {
  open: boolean
  setOpen: (openEventId: string) => void
  eventID: string
  soignant?: Soignant
  handleDeleteEvent?: (eventID: string) => void
}

export default function AppointmentSheet({
  open,
  setOpen,
  eventID,
  soignant,
  handleDeleteEvent,
}: AppointmentSheetProps) {
  const queryClient = useQueryClient()
  const { isPending, appointment, refetch } = useAppointmentByIDQuery(eventID, {
    enabled: false,
  })
  const { updateAppointment } = useAppointmentMutations()
  const patients = usePatientQueries().patients

  const [selectedPatient, setSelectedPatient] = useState('')
  const [expandedSections, setExpandedSections] = useState<
    Record<number, boolean>
  >({})

  const form = useAppForm({
    defaultValues: {
      thematic: '',
      type: '',
      appointmentPatients: [
        {
          accompanying: '',
          status: '',
          rejectionReason: '',
          transmissionNotes: '',
          patientID: '',
        },
      ],
    },
    onSubmit: ({ value }) => {
      if (!appointment?.id) {
        return
      }

      const updateAppointmentData: UpdateAppointmentParams = {
        id: appointment.id,
        thematic: value.thematic,
        type: value.type,
        appointmentPatients: value.appointmentPatients,
      }

      updateAppointment.mutate(updateAppointmentData, {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
        },
      })
      setOpen('')
    },
  })

  const selectedPatientIDs =
    form.state.values.appointmentPatients?.map((ap) => ap.patientID) ?? []
  const patientOptions =
    patients
      ?.slice()
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .filter((patient) => !selectedPatientIDs.includes(patient.id))
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
      })) ?? []

  const handleDelete = () => {
    if (appointment) {
      handleDeleteEvent?.(appointment.id)
      setOpen('')
    }
  }

  const handleSelectPatient = (patientID: string) => {
    setSelectedPatient(patientID)
  }

  useEffect(() => {
    if (open) {
      refetch().then(({ data }) => {
        if (data) {
          form.reset(
            {
              thematic: data.thematic ?? '',
              type: data.type ?? '',
              appointmentPatients:
                data.appointmentPatients?.map((ap) => ({
                  id: ap.id ?? '',
                  accompanying: ap.accompanying ?? '',
                  status: ap.status ?? '',
                  rejectionReason: ap.rejectionReason ?? '',
                  transmissionNotes: ap.transmissionNotes ?? '',
                  patientID: ap.patient.id,
                })) ?? [],
            },
            { keepDefaultValues: true },
          )
        }
      })
    }
  }, [open, form, refetch])

  const thematicOptions = soignant
    ? getThemeOptionsByRole(THEMATICS, soignant.name)
    : []

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? eventID : '')}
    >
      <SheetContent className="flex flex-col h-full">
        <SheetHeader className="flex flex-row justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="pl-2 relative flex justify-center items-center before:z-[-1] before:absolute before:bg-primary/30 before:rounded-full before:w-6.5 before:h-6.5 after:z-[-1] after:absolute after:bg-primary/10 after:rounded-full after:w-9.5 after:h-9.5">
              <FilePlus
                fill="#2563eb"
                strokeWidth={1}
                className="h-4 w-4 text-card z-1"
              />
            </div>
            <div>
              <SheetTitle className="mb-[-4px]">Rendez-vous</SheetTitle>
              <div className="text-sm text-text-light">
                {`${dayjs(appointment?.startDate)
                  .format('dddd D MMMM [de] hh:mm')
                  .replace(/^./, (c) => c.toUpperCase())}
                    ${dayjs(appointment?.endDate).format('[à] hh:mm')}
                    ${formatDuration(appointment?.startDate, appointment?.endDate)}`}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {isPending ? (
            <div className="flex-1 flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await form.validate('submit')
                  await form.handleSubmit()
                }}
                className="w-full flex-1 flex flex-col min-h-0 gap-2 px-4"
              >
                <form.AppField name="thematic">
                  {(field) => (
                    <field.Select
                      options={thematicOptions}
                      label="Thématique"
                    />
                  )}
                </form.AppField>

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

                <div className="mt-2 w-full border-t border-border"></div>

                <form.Field name="appointmentPatients" mode="array">
                  {(field) => (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-end gap-4 shrink-0">
                        <div className="flex-1">
                          <Label htmlFor={'patient-selection'}>
                            Ajouter un patient
                          </Label>
                          <Select
                            id={'patient-selection'}
                            value={selectedPatient}
                            onValueChange={(v) => handleSelectPatient(v)}
                            options={patientOptions}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          onClick={() => {
                            if (!selectedPatient) {
                              return
                            }
                            field.pushValue({
                              accompanying: '',
                              status: '',
                              rejectionReason: '',
                              transmissionNotes: '',
                              patientID: selectedPatient,
                            })
                            setSelectedPatient('')
                          }}
                        >
                          Ajouter
                        </Button>
                      </div>

                      <div className="text-sm text-text-light mt-3 mb-0.5 shrink-0">
                        Liste des patients
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-scroll pr-2 space-y-2">
                        {field.state.value.map((appointmentPatient, index) => {
                          const patientData = patients?.find(
                            (p) => p.id === appointmentPatient.patientID,
                          )
                          const isExpanded = expandedSections[index] ?? false
                          const toggleExpand = () =>
                            setExpandedSections((prev) => ({
                              ...prev,
                              [index]: !prev[index],
                            }))

                          return (
                            <div
                              key={patientData?.id}
                              className="border border-border rounded-md py-2 px-4"
                            >
                              <div className="flex justify-between items-center">
                                <div className="text-sm">
                                  {patientData
                                    ? `${patientData.firstName} ${patientData.lastName}`
                                    : ``}
                                </div>
                                <div className="flex gap-2 items-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="button"
                                    onClick={toggleExpand}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <div className="h-6 border-l border-border"></div>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    type="button"
                                    onClick={() => field.removeValue(index)}
                                  >
                                    <TrashIcon className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="flex flex-col gap-2 pb-2">
                                  <div className="w-full flex gap-4">
                                    {/* accompanying */}
                                    <form.Field
                                      name={`appointmentPatients[${index}].accompanying`}
                                    >
                                      {(subField) => (
                                        <FormField className={'flex-1'}>
                                          <Label htmlFor={field.name}>
                                            Accompagnant
                                          </Label>
                                          <Select
                                            id={subField.name}
                                            value={subField.state.value ?? ''}
                                            onValueChange={(v) =>
                                              subField.handleChange(v)
                                            }
                                            options={
                                              APPOINTMENT_ACCOMPANYING_OPTIONS
                                            }
                                          />
                                        </FormField>
                                      )}
                                    </form.Field>

                                    {/* status */}
                                    <form.Field
                                      name={`appointmentPatients[${index}].status`}
                                    >
                                      {(subField) => (
                                        <FormField className={'flex-1'}>
                                          <Label htmlFor={field.name}>
                                            Présence
                                          </Label>
                                          <Select
                                            id={subField.name}
                                            value={subField.state.value ?? ''}
                                            onValueChange={(v) =>
                                              subField.handleChange(v)
                                            }
                                            options={APPOINTMENT_STATUS_OPTIONS}
                                          />
                                        </FormField>
                                      )}
                                    </form.Field>
                                  </div>

                                  {/* rejectionReason */}
                                  <form.Field
                                    name={`appointmentPatients[${index}].rejectionReason`}
                                  >
                                    {(subField) => (
                                      <FormField>
                                        <Label htmlFor={field.name}>
                                          Raison de refus
                                        </Label>
                                        <Input
                                          id={subField.name}
                                          value={subField.state.value}
                                          onChange={(e) =>
                                            subField.handleChange(
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </FormField>
                                    )}
                                  </form.Field>

                                  {/* transmissionNotes */}
                                  <form.Field
                                    name={`appointmentPatients[${index}].transmissionNotes`}
                                  >
                                    {(subField) => (
                                      <FormField>
                                        <Label htmlFor={field.name}>
                                          Notes de transmission
                                        </Label>
                                        <Input
                                          id={subField.name}
                                          value={subField.state.value}
                                          onChange={(e) =>
                                            subField.handleChange(
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </FormField>
                                    )}
                                  </form.Field>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </form.Field>
              </form>

              <div className="w-full border-t border-border"></div>

              <div className="px-4 py-4 flex justify-between gap-4 shrink-0">
                <div>
                  <Button variant="destructive" onClick={() => handleDelete()}>
                    Supprimer
                  </Button>
                </div>
                <div className="flex gap-4">
                  <Button variant="default" onClick={() => form.handleSubmit()}>
                    Mettre à jour
                  </Button>
                  <Button variant="outline" onClick={() => setOpen('')}>
                    Annuler
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
