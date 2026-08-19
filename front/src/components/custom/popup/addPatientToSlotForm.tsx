import dayjs, { type Dayjs } from 'dayjs'
import { CalendarPlus, Check, X } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'

import { TOAST_SEVERITY } from '../../../constants/ui.constant.ts'
import { useToast } from '../../../hooks/useToast.ts'
import {
  type FreeInterval,
  getUpcomingSlotSuggestions,
  type SlotSuggestion,
} from '../../../libs/slotAvailability.ts'
import { generateDurationOptions } from '../../../libs/utils.ts'
import { useAppointmentMutations } from '../../../queries/useAppointment.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { Slot } from '../../../types/slot.ts'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'
import { Select, type SelectOption } from '../../ui/select.tsx'
import {
  AppointmentTimeFields,
  AppointmentTypeField,
} from '../appointmentDetailsFields.tsx'

interface AddPatientToSlotFormProps {
  trigger?: React.ReactNode
}

const formatSlotDate = (date: string) =>
  dayjs
    .utc(date)
    .format('dddd D MMMM')
    .replace(/^./, (c) => c.toUpperCase())

const formatSlotRange = (start: string, end: string) =>
  `${dayjs.utc(start).format('HH[h]mm')} - ${dayjs.utc(end).format('HH[h]mm')}`

const formatSoignants = (slot: Slot) =>
  slot.slotTemplate?.soignants?.length
    ? slot.slotTemplate.soignants.map((soignant) => soignant.name).join(', ')
    : 'Aucun soignant associé'

const roundDownToStep = (minutes: number) =>
  Math.max(15, Math.floor(minutes / 15) * 15)

/**
 * Valeurs par défaut d'heure, de durée et de type pour un créneau choisi :
 * on rejoint le rendez-vous collectif existant s'il y en a un, sinon on
 * propose l'intervalle libre (individuel) ou le créneau entier (collectif
 * vide).
 */
const getSuggestionDefaults = (
  suggestion: SlotSuggestion,
  thematicDuration?: number | null,
) => {
  const { slot, isIndividual, freeInterval, joinableAppointmentID } = suggestion

  if (joinableAppointmentID) {
    // On rejoint un rendez-vous collectif existant : ses valeurs font foi.
    const existing = slot.appointments?.find(
      (appointment) => appointment.id === joinableAppointmentID,
    )
    return {
      startTime: dayjs.utc(existing?.startDate ?? slot.startDate),
      duration: roundDownToStep(
        dayjs
          .utc(existing?.endDate ?? slot.endDate)
          .diff(dayjs.utc(existing?.startDate ?? slot.startDate), 'minute'),
      ).toString(),
      appointmentType: existing?.type ?? '',
    }
  }

  if (isIndividual && freeInterval) {
    const intervalStart = dayjs.utc(freeInterval.start)
    const intervalMinutes = dayjs
      .utc(freeInterval.end)
      .diff(intervalStart, 'minute')
    const defaultDuration =
      thematicDuration && thematicDuration <= intervalMinutes
        ? thematicDuration
        : intervalMinutes

    return {
      startTime: intervalStart,
      duration: roundDownToStep(defaultDuration).toString(),
      appointmentType: '',
    }
  }

  // Créneau collectif encore vide : le rendez-vous occupe tout le créneau.
  return {
    startTime: dayjs.utc(slot.startDate),
    duration: roundDownToStep(
      dayjs.utc(slot.endDate).diff(dayjs.utc(slot.startDate), 'minute'),
    ).toString(),
    appointmentType: '',
  }
}

const getSuggestionBadge = (suggestion: SlotSuggestion) => {
  if (suggestion.alreadyBooked) {
    return 'déjà inscrit'
  }
  if (suggestion.isIndividual) {
    return ''
  }
  return `${suggestion.bookedCount}/${suggestion.capacity}`
}

/**
 * Inscriptions existantes d'un rendez-vous collectif, mises en forme pour la
 * charge utile d'`updateAppointment` — inchangées, prêtes à recevoir le
 * nouveau patient.
 */
const buildExistingAppointmentPatients = (appointment: Appointment) =>
  (appointment.appointmentPatients ?? []).map((appointmentPatient) => ({
    id: appointmentPatient.id,
    patientID: appointmentPatient.patient.id,
    accompanying: appointmentPatient.accompanying,
    status: appointmentPatient.status,
    rejectionReason: appointmentPatient.rejectionReason,
    transmissionNotes: appointmentPatient.transmissionNotes,
  }))

/**
 * Ramène une durée sélectionnée à la plus grande option encore disponible
 * quand elle ne figure plus dans la liste (l'heure de début a avancé et a
 * raccourci l'intervalle restant).
 */
const clampDurationToOptions = (
  duration: string,
  options: SelectOption[],
): string => {
  if (!options.length || options.some((option) => option.value === duration)) {
    return duration
  }
  return String(options[options.length - 1].value)
}

/**
 * Bornes de l'intervalle libre d'un créneau individuel sélectionné, pour
 * contraindre le TimePicker (`minTime`/`maxTime`) — absentes pour un créneau
 * collectif ou tant qu'aucun créneau n'est sélectionné.
 */
const getFreeIntervalBounds = (
  selected: SlotSuggestion | null,
): { freeInterval?: FreeInterval; minTime?: Dayjs; maxTime?: Dayjs } => {
  const freeInterval = selected?.isIndividual
    ? selected.freeInterval
    : undefined

  if (!freeInterval) {
    return {}
  }

  return {
    freeInterval,
    minTime: dayjs.utc(freeInterval.start),
    maxTime: dayjs.utc(freeInterval.end),
  }
}

/**
 * Rendez-vous collectif ciblé par `handleConfirm`, relu depuis les données
 * vivantes du cache (`slots`) plutôt que depuis l'instantané `selected` pris
 * à l'étape 1 — évite de supprimer silencieusement une inscription posée
 * entre-temps par quelqu'un d'autre.
 */
const resolveLiveJoinTarget = (
  slots: Slot[] | undefined,
  selected: SlotSuggestion,
): Appointment | undefined => {
  const liveSlot = slots?.find((slot) => slot.id === selected.slot.id)
  return liveSlot?.appointments?.find(
    (appointment) => appointment.id === selected.joinableAppointmentID,
  )
}

/**
 * Charge utile d'`updateAppointment` pour rejoindre un rendez-vous collectif
 * existant : on conserve sa thématique et son type tels quels (pas de repli
 * sur ceux choisis dans la popup), et toutes ses inscriptions existantes.
 */
const buildJoinPayload = (target: Appointment, patientID: string) => ({
  id: target.id,
  thematicId: target.thematicId,
  type: target.type,
  appointmentPatients: [
    ...buildExistingAppointmentPatients(target),
    { patientID },
  ],
})

function AddPatientToSlotForm({ trigger }: AddPatientToSlotFormProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="w-full">
            <CalendarPlus className="w-4 h-4" />
            Ajouter un patient à un RDV
          </Button>
        )}
      </PopupTrigger>

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle>Ajouter un patient à un rendez-vous</PopupTitle>
        </PopupHeader>

        {/* Les hooks de données (créneaux, patients, thématiques) ne se
        montent qu'à l'ouverture de la popup, pas au chargement de la page. */}
        {open && <AddPatientToSlotContent onClose={() => setOpen(false)} />}
      </PopupContent>
    </Popup>
  )
}

interface AddPatientToSlotContentProps {
  onClose: () => void
}

function AddPatientToSlotContent({ onClose }: AddPatientToSlotContentProps) {
  const [step, setStep] = useState(1)
  const [patientID, setPatientID] = useState('')
  const [thematicID, setThematicID] = useState('')
  const [selected, setSelected] = useState<SlotSuggestion | null>(null)
  const [startTime, setStartTime] = useState(dayjs.utc())
  const [duration, setDuration] = useState('')
  const [appointmentType, setAppointmentType] = useState('')

  const { toast } = useToast()
  const { createAppointment, updateAppointment } = useAppointmentMutations()

  const { slots } = useAllSlotsQuery()
  const { patients } = usePatientQueries()
  const { thematics } = useThematicQueries()

  const patientOptions = useMemo(
    () =>
      (patients ?? [])
        .map((patient) => ({
          value: patient.id,
          label: `${patient.firstName} ${patient.lastName}`,
          sortKey: `${patient.lastName} ${patient.firstName}`,
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
        .map(({ value, label }) => ({ value, label })),
    [patients],
  )

  const thematicOptions = useMemo(
    () =>
      (thematics ?? [])
        .map((thematic) => ({ value: thematic.id, label: thematic.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [thematics],
  )

  const suggestions = useMemo(
    () => getUpcomingSlotSuggestions(slots, thematicID, patientID),
    [slots, thematicID, patientID],
  )

  const selectedPatient = patients?.find((patient) => patient.id === patientID)
  const selectedThematic = thematics?.find(
    (thematic) => thematic.id === thematicID,
  )

  const joinedAppointment = selected?.joinableAppointmentID
    ? selected.slot.appointments?.find(
        (appointment) => appointment.id === selected.joinableAppointmentID,
      )
    : undefined

  const isJoining = !!joinedAppointment
  const areTimeFieldsDisabled = isJoining || !selected?.isIndividual

  const { freeInterval: individualFreeInterval, minTime, maxTime } = useMemo(
    () => getFreeIntervalBounds(selected),
    [selected],
  )

  const durationOptions = useMemo(() => {
    if (!selected) {
      return []
    }
    if (individualFreeInterval) {
      return generateDurationOptions(
        startTime.toISOString(),
        individualFreeInterval.end,
      )
    }
    return generateDurationOptions(
      selected.slot.startDate,
      selected.slot.endDate,
    )
  }, [selected, individualFreeInterval, startTime])

  const handleSelectSuggestion = (suggestion: SlotSuggestion) => {
    if (suggestion.alreadyBooked) {
      return
    }

    const defaults = getSuggestionDefaults(
      suggestion,
      selectedThematic?.duration,
    )
    setStartTime(defaults.startTime)
    setDuration(defaults.duration)
    setAppointmentType(defaults.appointmentType)

    setSelected(suggestion)
    setStep(2)
  }

  const handleStartTimeChange = (value: Dayjs) => {
    setStartTime(value)

    if (!individualFreeInterval) {
      return
    }

    const nextOptions = generateDurationOptions(
      value.toISOString(),
      individualFreeInterval.end,
    )
    setDuration((current) => clampDurationToOptions(current, nextOptions))
  }

  const handleBack = () => {
    setSelected(null)
    setStep(1)
  }

  const handleConfirm = () => {
    if (!selected || !patientID) {
      return
    }

    if (selected.joinableAppointmentID) {
      const target = resolveLiveJoinTarget(slots, selected)

      if (!target) {
        toast({
          title: "Ce rendez-vous n'est plus disponible",
          severity: TOAST_SEVERITY.WARNING,
        })
        handleBack()
        return
      }

      updateAppointment.mutate(buildJoinPayload(target, patientID), {
        onSuccess: onClose,
      })
      return
    }

    const start = selected.isIndividual
      ? startTime
      : dayjs.utc(selected.slot.startDate)
    const end = selected.isIndividual
      ? start.add(Number.parseInt(duration, 10), 'minute')
      : dayjs.utc(selected.slot.endDate)

    createAppointment.mutate(
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        slotID: selected.slot.id,
        thematicId: thematicID,
        type: appointmentType,
        patientIDs: [patientID],
      },
      { onSuccess: onClose },
    )
  }

  return (
    <>
      <PopupBody>
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <FormField>
              <Label htmlFor="patient-selection">Patient</Label>
              <Select
                id="patient-selection"
                options={patientOptions}
                value={patientID}
                onValueChange={setPatientID}
                searchable
                placeholder="Sélectionnez un patient"
              />
            </FormField>

            <FormField>
              <Label htmlFor="thematic-selection">Thématique</Label>
              <Select
                id="thematic-selection"
                options={thematicOptions}
                value={thematicID}
                onValueChange={setThematicID}
                disabled={!patientID}
                placeholder="Sélectionnez une thématique"
              />
            </FormField>

            <div className="flex flex-col gap-2">
              <Label>Prochains créneaux disponibles</Label>

              {!patientID || !thematicID ? (
                <p className="text-sm text-text-light">
                  Sélectionnez un patient et une thématique.
                </p>
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-text-light">
                  Aucun créneau disponible pour cette thématique.
                </p>
              ) : (
                <ul className="flex flex-col max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.slot.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion)}
                        disabled={suggestion.alreadyBooked}
                        className="flex items-center gap-3 w-full text-left px-3 py-2 hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              suggestion.slot.slotTemplate?.color ?? '#2563eb',
                          }}
                        />
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            {`${formatSlotDate(suggestion.slot.startDate)} · ${formatSlotRange(suggestion.slot.startDate, suggestion.slot.endDate)}`}
                          </span>
                          <span className="text-xs text-text-light truncate">
                            {formatSoignants(suggestion.slot)}
                          </span>
                        </span>
                        <span className="text-xs text-text-light shrink-0">
                          {getSuggestionBadge(suggestion)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div className="flex flex-col gap-2">
            <div className="text-sm">
              <span className="text-text-light">Patient : </span>
              {selectedPatient
                ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                : ''}
            </div>
            <div className="text-sm">
              <span className="text-text-light">Thématique : </span>
              {selectedThematic?.name ?? ''}
            </div>
            <div className="text-sm">
              <span className="text-text-light">Créneau : </span>
              {formatSlotDate(selected.slot.startDate)}{' '}
              {formatSlotRange(selected.slot.startDate, selected.slot.endDate)}
            </div>
            <div className="text-sm">
              <span className="text-text-light">Soignants : </span>
              {formatSoignants(selected.slot)}
            </div>

            {isJoining && (
              <p className="text-sm text-text-light">
                Vous rejoignez un rendez-vous existant ({selected.bookedCount}
                /{selected.capacity} patients).
              </p>
            )}

            <AppointmentTimeFields
              date={selected.slot.startDate}
              startTime={startTime}
              onStartTimeChange={handleStartTimeChange}
              duration={duration}
              onDurationChange={setDuration}
              durationOptions={durationOptions}
              disabled={areTimeFieldsDisabled}
              durationFieldId="appointment-duration"
              minTime={minTime}
              maxTime={maxTime}
            />

            <AppointmentTypeField
              id="appointment-type"
              value={appointmentType}
              onChange={setAppointmentType}
              disabled={isJoining}
            />
          </div>
        )}
      </PopupBody>

      <PopupFooter>
        {step === 2 && (
          <Button
            variant="default"
            onClick={handleConfirm}
            isLoading={
              createAppointment.isPending || updateAppointment.isPending
            }
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        )}
        {step === 2 && (
          <Button variant="outline" onClick={handleBack}>
            Retour
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          <X className="w-4 h-4" />
          Annuler
        </Button>
      </PopupFooter>
    </>
  )
}

export default AddPatientToSlotForm
