import { useStore } from '@tanstack/react-form'
import dayjs, { type Dayjs } from 'dayjs'
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronRight,
  ChevronsDown,
  Users,
  X,
} from 'lucide-react'
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
import { useSlotsInRangeQuery } from '../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { Slot } from '../../../types/slot.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { FormField } from '../../ui/formField.tsx'
import { TextArea } from '../../ui/input.tsx'
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
import { TimePicker } from '../../ui/timePicker.tsx'

/** Largeur de la fenêtre de créneaux demandée au serveur, et de chaque extension. */
const RANGE_WEEKS = 4

/**
 * Fenêtre [from, to) demandée au serveur : à partir de la date choisie (jamais
 * avant aujourd'hui), sur `weeks` semaines. `until` est son dernier jour inclus.
 */
const getSlotWindow = (fromDate: Dayjs, weeks: number) => {
  const today = dayjs.utc().startOf('day')
  const from = fromDate.isAfter(today) ? fromDate : today
  const to = from.add(weeks, 'week')
  return {
    from: from.format('YYYY-MM-DD'),
    to: to.format('YYYY-MM-DD'),
    until: to.subtract(1, 'day').format('D MMMM YYYY'),
  }
}

/**
 * Le dernier élargissement, pour la même thématique, n'a rien ajouté.
 * ponytail: une fenêtre vide de RANGE_WEEKS (vacances) suffit à conclure ;
 * changer « À partir du » relance la recherche plus loin.
 */
export const isWindowExhausted = (
  beforeLoad: { thematicID: string; count: number } | null,
  thematicID: string,
  isFetching: boolean,
  count: number,
) =>
  beforeLoad?.thematicID === thematicID &&
  !isFetching &&
  count === beforeLoad.count

/** Comme dans les parcours, le motif d'un rendez-vous individuel est obligatoire. */
export const isMotifMissing = (
  selected: SlotSuggestion | null,
  motif: string,
) => !!selected?.isIndividual && !motif.trim()

interface AddPatientToSlotFormProps {
  trigger?: React.ReactNode
  /** Patient présélectionné, depuis sa fiche. */
  patientID?: string
  /** Jour du rendez-vous créé, pour suivre la page vers cette date. */
  onBooked?: (day: Dayjs) => void
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

/** Une ligne de la liste ; complète ou déjà réservée, elle reste visible mais grisée. */
const SlotSuggestionRow = ({
  suggestion,
  onSelect,
}: {
  suggestion: SlotSuggestion
  onSelect: (suggestion: SlotSuggestion) => void
}) => {
  const isSelectable = !suggestion.alreadyBooked && !suggestion.isFull
  const { slot } = suggestion
  const location = slot.slotTemplate?.location?.name
  const fill = suggestion.isIndividual
    ? 0
    : Math.min(1, suggestion.bookedCount / suggestion.capacity)

  return (
    <button
      type="button"
      onClick={() => onSelect(suggestion)}
      disabled={!isSelectable}
      className={cn(
        'grid grid-cols-[104px_4px_minmax(0,1fr)_150px_16px] gap-3 items-center w-full text-left py-3 pl-4 pr-3.5 border-b border-muted bg-primary-foreground transition-colors',
        isSelectable
          ? 'cursor-pointer hover:bg-[#f8fafc]'
          : 'cursor-not-allowed opacity-55',
      )}
    >
      <span className="text-[15px] font-semibold text-foreground tabular-nums">
        {formatSlotRange(slot.startDate, slot.endDate)}
      </span>
      <span
        className="w-1 h-[34px] rounded-full"
        style={{ backgroundColor: slot.slotTemplate?.color ?? '#2563eb' }}
      />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {formatSoignants(slot)}
          {location && (
            <span className="font-normal text-text-light"> · {location}</span>
          )}
        </span>
        <span className="text-xs text-text-light">
          {suggestion.isIndividual
            ? 'Créneau individuel : horaire et durée à choisir'
            : 'Séance collective'}
        </span>
      </span>
      <span className="flex flex-col gap-1 items-end">
        <span
          className={cn(
            'text-xs font-semibold whitespace-nowrap',
            isSelectable ? 'text-[#15803d]' : 'text-text-light',
          )}
        >
          {getCapacityLabel(suggestion)}
        </span>
        <span className="w-[110px] h-[5px] rounded-full bg-muted overflow-hidden">
          <span
            className={cn(
              'block h-full',
              suggestion.isFull ? 'bg-[#94a3b8]' : 'bg-primary',
            )}
            style={{ width: `${fill * 100}%` }}
          />
        </span>
      </span>
      {isSelectable ? (
        <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
      ) : (
        <span />
      )}
    </button>
  )
}

/** Créneaux groupés par jour (en-tête collant), puis « Charger plus ». */
const SlotList = ({
  isReady,
  suggestions,
  until,
  hasMore,
  isLoading,
  onSelect,
  onLoadMore,
}: {
  isReady: boolean
  suggestions: SlotSuggestion[]
  until: string
  hasMore: boolean
  isLoading: boolean
  onSelect: (suggestion: SlotSuggestion) => void
  onLoadMore: () => void
}) => {
  if (!isReady) {
    return (
      <EmptySlotList>
        Sélectionnez un patient et une thématique pour voir les créneaux à
        venir.
      </EmptySlotList>
    )
  }
  if (suggestions.length === 0 && !hasMore) {
    return (
      <EmptySlotList>
        Aucun créneau à partir de cette date pour cette thématique.
      </EmptySlotList>
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto border border-border rounded-[10px]">
      {groupSuggestionsByDay(suggestions).map((group) => (
        <section key={group.day}>
          <h3 className="sticky top-0 z-[1] px-4 py-2 m-0 bg-[#f8fafc] border-b border-border text-[13px] font-semibold text-text-dark">
            {formatSlotDate(group.suggestions[0].slot.startDate)}
          </h3>
          {group.suggestions.map((suggestion) => (
            <SlotSuggestionRow
              key={suggestion.slot.id}
              suggestion={suggestion}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
      {suggestions.length === 0 && (
        <div className="px-4 py-8 text-sm text-center text-text-light">
          Aucun créneau d'ici le {until}.
        </div>
      )}
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 w-full h-11 cursor-pointer text-sm font-semibold text-primary hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60"
        >
          <ChevronsDown className="w-4 h-4" />
          {isLoading ? 'Chargement…' : 'Charger plus de créneaux'}
        </button>
      ) : (
        <div className="flex items-center justify-center h-11 text-[13px] text-text-light">
          Aucun autre créneau pour cette thématique
        </div>
      )}
    </div>
  )
}

/** Indicateur « ① Créneau — ② Détails », piloté par l'étape courante. */
const StepIndicator = ({ step }: { step: number }) => (
  <ol className="flex items-center gap-2 mt-1 ml-11 text-[13px]">
    {['Créneau', 'Détails'].map((label, index) => {
      const n = index + 1
      const isActive = step === n
      const isDone = step > n
      return (
        <li
          key={label}
          aria-current={isActive ? 'step' : undefined}
          className="flex items-center gap-2"
        >
          {index > 0 && <span className="w-5 h-px bg-[#cbd5e1]" />}
          <span
            className={cn(
              'flex items-center gap-1.5',
              isActive && 'font-semibold text-foreground',
              isDone && 'text-foreground',
              !isActive && !isDone && 'text-[#94a3b8]',
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] font-bold',
                isActive && 'bg-primary text-white',
                isDone && 'bg-green-600 text-white',
                !isActive && !isDone && 'bg-border text-text-light',
              )}
            >
              {isDone ? '✓' : n}
            </span>
            {label}
          </span>
        </li>
      )
    })}
  </ol>
)

const formatSlotDate = (date: string) =>
  dayjs
    .utc(date)
    .format('dddd D MMMM')
    .replace(/^./, (c) => c.toUpperCase())

const formatSlotRange = (start: string, end: string) =>
  `${dayjs.utc(start).format('HH:mm')} – ${dayjs.utc(end).format('HH:mm')}`

const formatSlotPlace = (slot: Slot) =>
  [formatSoignants(slot), slot.slotTemplate?.location?.name]
    .filter(Boolean)
    .join(' · ')

/** Suggestions consécutives d'un même jour (UTC), dans l'ordre reçu. */
export const groupSuggestionsByDay = (suggestions: SlotSuggestion[]) => {
  const days: { day: string; suggestions: SlotSuggestion[] }[] = []
  for (const suggestion of suggestions) {
    const day = dayjs.utc(suggestion.slot.startDate).format('YYYY-MM-DD')
    const last = days.at(-1)
    if (last?.day === day) {
      last.suggestions.push(suggestion)
    } else {
      days.push({ day, suggestions: [suggestion] })
    }
  }
  return days
}

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

export const getCapacityLabel = (suggestion: SlotSuggestion) => {
  if (suggestion.alreadyBooked) {
    return 'Déjà inscrit·e'
  }
  if (suggestion.isFull) {
    return 'Complet'
  }
  if (suggestion.isIndividual) {
    return 'Individuel · libre'
  }
  const free = suggestion.capacity - suggestion.bookedCount
  return `${free} ${free > 1 ? 'places libres' : 'place libre'} sur ${suggestion.capacity}`
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

function AddPatientToSlotForm({
  trigger,
  patientID,
  onBooked,
}: AddPatientToSlotFormProps) {
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

      <PopupContent size="lg" className="w-[720px] h-[820px]">
        {/* Les hooks de données (créneaux, patients, thématiques) ne se
        montent qu'à l'ouverture de la popup, pas au chargement de la page. */}
        {open && (
          <AddPatientToSlotContent
            initialPatientID={patientID}
            onBooked={onBooked}
            onClose={() => setOpen(false)}
          />
        )}
      </PopupContent>
    </Popup>
  )
}

interface AddPatientToSlotContentProps {
  initialPatientID?: string
  onBooked?: (day: Dayjs) => void
  onClose: () => void
}

function AddPatientToSlotContent({
  initialPatientID,
  onBooked,
  onClose,
}: AddPatientToSlotContentProps) {
  // État d'interface : la navigation de l'assistant, le créneau retenu et le
  // filtre de recherche ne sont pas des valeurs envoyées au serveur.
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<SlotSuggestion | null>(null)
  const [fromDate, setFromDate] = useState<Dayjs>(dayjs.utc().startOf('day'))
  // Fenêtre bornée côté serveur, élargie de RANGE_WEEKS à chaque « Charger plus ».
  const [weeks, setWeeks] = useState(RANGE_WEEKS)
  // Nombre de créneaux avant le dernier élargissement, par thématique : s'il
  // n'a rien ajouté, on considère qu'il n'y a plus rien à charger.
  const [beforeLoad, setBeforeLoad] = useState<{
    thematicID: string
    count: number
  } | null>(null)

  const { toast } = useToast()
  const { createAppointment, updateAppointment } = useAppointmentMutations()

  // Seuls les créneaux à venir à partir de la date de recherche sont proposés.
  const upcomingRange = useMemo(
    () => getSlotWindow(fromDate, weeks),
    [fromDate, weeks],
  )
  const { slots, isFetching } = useSlotsInRangeQuery(upcomingRange)
  const { patients } = usePatientQueries()
  const { thematics } = useThematicQueries()

  // `useAppForm` réapplique ses options à chaque rendu : des valeurs par défaut
  // recréées à chaque fois (ici un Dayjs, donc une nouvelle identité) le font
  // boucler à l'infini. On ne les construit qu'une fois.
  const [defaultValues] = useState(() => ({
    patientID: initialPatientID ?? '',
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
  const motif = useStore(form.store, (state) => state.values.motif)

  const patientOptions = useMemo(
    () =>
      (patients ?? [])
        .map((patient) => ({
          value: patient.id,
          label: `${patient.lastName} ${patient.firstName}`,
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
        Number.POSITIVE_INFINITY,
      ),
    [slots, thematicID, patientID, fromDate],
  )
  const hasMore = !isWindowExhausted(
    beforeLoad,
    thematicID,
    isFetching,
    suggestions.length,
  )
  const handleLoadMore = () => {
    setBeforeLoad({ thematicID, count: suggestions.length })
    setWeeks((current) => current + RANGE_WEEKS)
  }
  const freeCount = suggestions.filter(
    (suggestion) => !suggestion.isFull && !suggestion.alreadyBooked,
  ).length

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
  const missingMotif = isMotifMissing(selected, motif)
  const areTimeFieldsDisabled = isJoining || !selected?.isIndividual

  const {
    freeInterval: individualFreeInterval,
    minTime,
    maxTime,
  } = useMemo(() => getFreeIntervalBounds(selected), [selected])

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
    if (!selected || !value.patientID || missingMotif) {
      return
    }

    const booked = () => {
      onBooked?.(dayjs.utc(selected.slot.startDate).startOf('day'))
      onClose()
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
        onSuccess: booked,
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
        motif: selected.isIndividual ? value.motif.trim() : null,
        patientIDs: [value.patientID],
      },
      { onSuccess: booked },
    )
  }

  const patientLabel = selectedPatient
    ? `${selectedPatient.lastName} ${selectedPatient.firstName}`
    : ''

  return (
    <>
      <PopupHeader className="py-[18px]">
        <PopupTitle icon={CalendarPlus}>
          Ajouter un patient à un rendez-vous
        </PopupTitle>
        <StepIndicator step={step} />
      </PopupHeader>

      {step === 1 && (
        <PopupBody className="flex flex-col pt-5 pb-0">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px] gap-3">
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

            <FormField>
              <Label>À partir du</Label>
              <DatePicker
                value={fromDate}
                // Pendant la saisie au clavier, le champ émet des dates
                // incomplètes donc invalides : les ignorer, sinon le rendu
                // suivant casse sur `toISOString()`.
                onChange={(value) => {
                  if (value?.isValid()) {
                    setFromDate(value.startOf('day'))
                    setWeeks(RANGE_WEEKS)
                    setBeforeLoad(null)
                  }
                }}
                minDate={dayjs.utc().startOf('day')}
              />
            </FormField>
          </div>

          <div className="flex items-baseline justify-between mt-3.5 mb-2.5">
            <span className="text-[15px] font-semibold text-foreground">
              Créneaux disponibles{' '}
              <span className="font-normal text-text-light">({freeCount})</span>
            </span>
            <span className="text-xs text-text-light">
              Cliquez sur un créneau pour continuer
            </span>
          </div>

          <SlotList
            isReady={!!patientID && !!thematicID}
            suggestions={suggestions}
            until={upcomingRange.until}
            hasMore={hasMore}
            isLoading={isFetching}
            onSelect={handleSelectSuggestion}
            onLoadMore={handleLoadMore}
          />
        </PopupBody>
      )}

      {step === 2 && selected && (
        <PopupBody className="flex flex-col gap-4 pt-5">
          <div className="flex gap-3.5 px-4 py-3.5 border border-border rounded-[10px] bg-[#f8fafc]">
            <span
              className="w-1 rounded-full shrink-0"
              style={{
                backgroundColor: selected.slot.slotTemplate?.color ?? '#2563eb',
              }}
            />
            <div className="flex flex-col flex-1 gap-1 min-w-0">
              <span className="text-base font-semibold text-foreground">
                {`${formatSlotDate(selected.slot.startDate)} · ${formatSlotRange(selected.slot.startDate, selected.slot.endDate)}`}
              </span>
              <span className="text-sm text-text-dark">
                {formatSlotPlace(selected.slot)}
              </span>
              <span className="text-[13px] text-text-light">
                {`${patientLabel} · ${selectedThematic?.name ?? ''}`}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="self-start h-[30px] px-2.5 text-[13px]"
            >
              Changer
            </Button>
          </div>

          {isJoining && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-blue-50 text-sm text-blue-800">
              <Users className="w-4 h-4 shrink-0" />
              <span>
                {`Rejoint un rendez-vous existant (${selected.bookedCount}/${selected.capacity} patients).`}
              </span>
            </div>
          )}

          {/* Sur un créneau collectif, l'horaire est celui du créneau : seuls
          les créneaux individuels exposent début, durée et motif. */}
          {!areTimeFieldsDisabled && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <FormField>
                  <Label>Début</Label>
                  <TimePicker
                    value={startTime}
                    onChange={(time) =>
                      handleStartTimeChange(time ?? dayjs.utc())
                    }
                    minTime={minTime}
                    maxTime={maxTime}
                  />
                </FormField>
                <form.Subscribe selector={(state) => state.values.duration}>
                  {(duration) => (
                    <FormField>
                      <Label htmlFor="appointment-duration">Durée</Label>
                      <Select
                        id="appointment-duration"
                        options={durationOptions}
                        value={duration}
                        onValueChange={(next) =>
                          form.setFieldValue('duration', next)
                        }
                        clearable={false}
                      />
                    </FormField>
                  )}
                </form.Subscribe>
                <form.AppField name="appointmentType">
                  {(field) => (
                    <field.Select
                      label="Type"
                      options={APPOINTMENT_TYPE_OPTIONS}
                    />
                  )}
                </form.AppField>
              </div>

              <form.Field name="motif">
                {(field) => (
                  <FormField>
                    <Label htmlFor="appointment-motif">
                      Motif <span className="text-red-600">*</span>{' '}
                      <span className="font-normal text-text-light">
                        · recopié dans les notes de transmission
                      </span>
                    </Label>
                    <TextArea
                      id="appointment-motif"
                      value={field.state.value}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        field.handleChange(e.target.value)
                      }
                      onBlur={field.handleBlur}
                    />
                  </FormField>
                )}
              </form.Field>
            </>
          )}

          {/* Collectif encore vide : seul le type reste à choisir. */}
          {areTimeFieldsDisabled && !isJoining && (
            <form.AppField name="appointmentType">
              {(field) => (
                <field.Select label="Type" options={APPOINTMENT_TYPE_OPTIONS} />
              )}
            </form.AppField>
          )}
        </PopupBody>
      )}

      {step === 1 ? (
        <PopupFooter className="items-center justify-between mt-auto">
          <span className="text-[13px] text-text-light">
            Les créneaux complets ou déjà réservés restent affichés, grisés.
          </span>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      ) : (
        <PopupFooter className="mt-auto">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            disabled={missingMotif}
            isLoading={
              createAppointment.isPending || updateAppointment.isPending
            }
          >
            <Check className="w-4 h-4" />
            {isJoining ? 'Ajouter au rendez-vous' : 'Créer le rendez-vous'}
          </Button>
        </PopupFooter>
      )}
    </>
  )
}

export default AddPatientToSlotForm
