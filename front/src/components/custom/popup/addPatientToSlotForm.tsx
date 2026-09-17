import { useStore } from '@tanstack/react-form'
import dayjs, { type Dayjs } from 'dayjs'
import { Check, X } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../../constants/appointment.constant.ts'
import { TOAST_SEVERITY } from '../../../constants/ui.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useToast } from '../../../hooks/useToast.ts'
import {
  type FreeInterval,
  getUpcomingSlotSuggestions,
  type SlotSuggestion,
} from '../../../libs/slotAvailability.ts'
import { cn, generateDurationOptions } from '../../../libs/utils.ts'
import { useAppointmentMutations } from '../../../queries/useAppointment.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { Slot } from '../../../types/slot.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
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
import type { SelectOption } from '../../ui/select.tsx'
import { AppointmentTimeFields } from '../appointmentDetailsFields.tsx'

interface AddPatientToSlotFormProps {
  trigger?: React.ReactNode
}

/**
 * Message d'attente à la place de la liste des créneaux — cadre en pointillés
 * pour le distinguer d'un libellé de champ.
 */
const EmptySlotList = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center px-4 py-8 text-sm text-center text-text-light border border-dashed border-border rounded-lg">
    {children}
  </div>
)

/**
 * Une ligne de la liste des créneaux. Un créneau complet s'affiche en rouge et
 * un créneau déjà pris par le patient s'estompe ; ni l'un ni l'autre n'est
 * cliquable.
 */
const SlotSuggestionRow = ({
  suggestion,
  onSelect,
}: {
  suggestion: SlotSuggestion
  onSelect: (suggestion: SlotSuggestion) => void
}) => {
  const isSelectable = !suggestion.alreadyBooked && !suggestion.isFull

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(suggestion)}
        disabled={!isSelectable}
        className={cn(
          'flex items-center gap-3 w-full text-left px-3 py-2 transition-colors',
          isSelectable ? 'cursor-pointer hover:bg-card' : 'cursor-not-allowed',
          suggestion.isFull && 'text-destructive',
          suggestion.alreadyBooked && !suggestion.isFull && 'opacity-50',
        )}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            backgroundColor: suggestion.slot.slotTemplate?.color ?? '#2563eb',
          }}
        />
        <span className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium">
            {`${formatSlotDate(suggestion.slot.startDate)} · ${formatSlotRange(suggestion.slot.startDate, suggestion.slot.endDate)}`}
          </span>
          <span
            className={cn(
              'text-xs truncate',
              suggestion.isFull ? 'text-destructive/80' : 'text-text-light',
            )}
          >
            {formatSoignants(suggestion.slot)}
          </span>
        </span>
        <span
          className={cn(
            'text-xs shrink-0',
            suggestion.isFull
              ? 'text-destructive font-medium'
              : 'text-text-light',
          )}
        >
          {getSuggestionBadge(suggestion)}
        </span>
      </button>
    </li>
  )
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
  if (suggestion.isFull) {
    return suggestion.isIndividual
      ? 'complet'
      : `complet · ${suggestion.bookedCount}/${suggestion.capacity}`
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
          <Button
            type="button"
            variant="gradient"
            className="w-full"
            onClick={() => setOpen(true)}
          >
            Nouveau rendez-vous
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
  // État d'interface : la navigation de l'assistant, le créneau retenu et le
  // filtre de recherche ne sont pas des valeurs envoyées au serveur.
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<SlotSuggestion | null>(null)
  const [fromDate, setFromDate] = useState<Dayjs>(dayjs.utc().startOf('day'))

  const { toast } = useToast()
  const { createAppointment, updateAppointment } = useAppointmentMutations()

  const { slots } = useAllSlotsQuery()
  const { patients } = usePatientQueries()
  const { thematics } = useThematicQueries()

  // `useAppForm` réapplique ses options à chaque rendu : des valeurs par défaut
  // recréées à chaque fois (ici un Dayjs, donc une nouvelle identité) le font
  // boucler à l'infini. On ne les construit qu'une fois.
  const [defaultValues] = useState(() => ({
    patientID: '',
    thematicID: '',
    startTime: dayjs.utc(),
    duration: '',
    appointmentType: '',
    motif: '',
  }))

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value }) => handleConfirm(value),
  })

  const patientID = useStore(form.store, (state) => state.values.patientID)
  const thematicID = useStore(form.store, (state) => state.values.thematicID)
  const startTime = useStore(form.store, (state) => state.values.startTime)

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
    () =>
      getUpcomingSlotSuggestions(
        slots,
        thematicID,
        patientID,
        fromDate.toISOString(),
      ),
    [slots, thematicID, patientID, fromDate],
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
    if (suggestion.alreadyBooked || suggestion.isFull) {
      return
    }

    const defaults = getSuggestionDefaults(
      suggestion,
      selectedThematic?.duration,
    )
    form.setFieldValue('startTime', defaults.startTime)
    form.setFieldValue('duration', defaults.duration)
    form.setFieldValue('appointmentType', defaults.appointmentType)
    form.setFieldValue('motif', '')

    setSelected(suggestion)
    setStep(2)
  }

  const handleStartTimeChange = (value: Dayjs) => {
    form.setFieldValue('startTime', value)

    if (!individualFreeInterval) {
      return
    }

    const nextOptions = generateDurationOptions(
      value.toISOString(),
      individualFreeInterval.end,
    )
    form.setFieldValue('duration', (current) =>
      clampDurationToOptions(current, nextOptions),
    )
  }

  const handleBack = () => {
    setSelected(null)
    setStep(1)
  }

  function handleConfirm(value: {
    patientID: string
    thematicID: string
    startTime: Dayjs
    duration: string
    appointmentType: string
    motif: string
  }) {
    if (!selected || !value.patientID) {
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

      updateAppointment.mutate(buildJoinPayload(target, value.patientID), {
        onSuccess: onClose,
      })
      return
    }

    const start = selected.isIndividual
      ? value.startTime
      : dayjs.utc(selected.slot.startDate)
    const end = selected.isIndividual
      ? start.add(Number.parseInt(value.duration, 10), 'minute')
      : dayjs.utc(selected.slot.endDate)

    createAppointment.mutate(
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        slotID: selected.slot.id,
        thematicId: value.thematicID,
        type: value.appointmentType,
        // Le motif ne concerne que les créneaux individuels ; ailleurs le
        // champ n'est pas affiché et rien ne doit être enregistré.
        motif: selected.isIndividual ? value.motif.trim() || null : null,
        patientIDs: [value.patientID],
      },
      { onSuccess: onClose },
    )
  }

  return (
    <>
      <PopupBody>
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <form.AppField name="patientID">
              {(field) => (
                <field.Select
                  label="Patient"
                  options={patientOptions}
                  searchable
                  placeholder="Sélectionnez un patient"
                />
              )}
            </form.AppField>

            <form.AppField name="thematicID">
              {(field) => (
                <field.Select
                  label="Thématique"
                  options={thematicOptions}
                  searchable
                  placeholder="Sélectionnez une thématique"
                />
              )}
            </form.AppField>

            <FormField className="flex flex-col gap-1">
              <Label>À partir du</Label>
              <DatePicker
                value={fromDate}
                // Pendant la saisie au clavier, le champ émet des dates
                // incomplètes donc invalides : les ignorer, sinon le rendu
                // suivant casse sur `toISOString()`.
                onChange={(value) => {
                  if (value?.isValid()) {
                    setFromDate(value.startOf('day'))
                  }
                }}
                minDate={dayjs.utc().startOf('day')}
              />
            </FormField>

            <div className="flex flex-col gap-2">
              <Label>Prochains créneaux</Label>

              {!patientID || !thematicID ? (
                <EmptySlotList>
                  Sélectionnez un patient et une thématique pour voir les
                  créneaux à venir.
                </EmptySlotList>
              ) : suggestions.length === 0 ? (
                <EmptySlotList>
                  Aucun créneau à partir de cette date pour cette thématique.
                </EmptySlotList>
              ) : (
                <ul className="flex flex-col max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {suggestions.map((suggestion) => (
                    <SlotSuggestionRow
                      key={suggestion.slot.id}
                      suggestion={suggestion}
                      onSelect={handleSelectSuggestion}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase text-text-light">
              Récapitulatif
            </div>
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
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                <span className="text-text-light">Créneau : </span>
                {formatSlotDate(selected.slot.startDate)}{' '}
                {formatSlotRange(selected.slot.startDate, selected.slot.endDate)}
              </span>
              <Button
                type="button"
                variant="transparent"
                onClick={handleBack}
                className="h-auto p-0 text-sm underline underline-offset-4 hover:no-underline"
              >
                Modifier
              </Button>
            </div>
            <div className="text-sm">
              <span className="text-text-light">Soignants : </span>
              {formatSoignants(selected.slot)}
            </div>

            {isJoining && (
              <p className="text-sm text-text-light">
                Ajout à un rendez-vous existant ({selected.bookedCount}
                /{selected.capacity} patients).
              </p>
            )}

            {/* Sur un créneau collectif, l'horaire est celui du créneau : les
            champs seraient figés et répéteraient le récapitulatif. On ne les
            montre que là où ils servent, sur un créneau individuel. Ils gardent
            le composant partagé plutôt que `field.*` pour conserver la mise en
            page en ligne (« à 09h00 pendant 30min »), que des champs empilés
            sous un libellé chacun casseraient. */}
            {!areTimeFieldsDisabled && (
              <form.Subscribe selector={(state) => state.values.duration}>
                {(duration) => (
                  <AppointmentTimeFields
                    date={selected.slot.startDate}
                    showDate={false}
                    startTime={startTime}
                    onStartTimeChange={handleStartTimeChange}
                    duration={duration}
                    onDurationChange={(next) =>
                      form.setFieldValue('duration', next)
                    }
                    durationOptions={durationOptions}
                    durationFieldId="appointment-duration"
                    minTime={minTime}
                    maxTime={maxTime}
                  />
                )}
              </form.Subscribe>
            )}

            <form.AppField name="appointmentType">
              {(field) => (
                <field.Select
                  label="Type"
                  options={APPOINTMENT_TYPE_OPTIONS}
                  disabled={isJoining}
                />
              )}
            </form.AppField>

            {/* Le motif porte sur le rendez-vous d'un seul patient : il n'a de
            sens que sur un créneau individuel, où chaque patient a son propre
            rendez-vous. */}
            {selected.isIndividual && (
              <form.AppField name="motif">
                {(field) => (
                  <field.Input label="Motif" placeholder="Saisir le motif..." />
                )}
              </form.AppField>
            )}
          </div>
        )}
      </PopupBody>

      <PopupFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="w-4 h-4" />
          Annuler
        </Button>
        {step === 2 && (
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={
              createAppointment.isPending || updateAppointment.isPending
            }
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        )}
      </PopupFooter>
    </>
  )
}

export default AddPatientToSlotForm
