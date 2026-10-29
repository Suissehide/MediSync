import FullCalendar, {
  type CalendarRef,
  type DateSelectInfo,
  type DateSpanApi,
  type EventDisplayInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
  useCalendarController,
} from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import frLocale from '@fullcalendar/react/locales/fr'
import breezyTheme from '@fullcalendar/react/themes/breezy'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../../libs/utils.ts'
import { usePlanningStore } from '../../../store/usePlanningStore.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
import { BarreCalendrier } from './barreCalendrier.tsx'
import CalendarDatePickerButton from './calendarDatePickerButton.tsx'
import { EventContent } from './eventContent.tsx'

const toUtcDay = (date: Date) => date.toISOString().slice(0, 10)

type SlotLayout = Map<string, { column: number; totalColumns: number }>

const EMPTY_SLOT_LAYOUT: SlotLayout = new Map()

/**
 * Compute column layout for overlapping slot events.
 * Returns a Map of event ID → { column, totalColumns }.
 *
 * Les créneaux sont triés par début, donc un groupe de chevauchement se ferme
 * dès qu'un créneau commence après la fin la plus tardive du groupe courant :
 * un simple balayage suffit, là où un parcours de graphe coûterait O(n²).
 */
function computeSlotLayout(events: CalendarEvent[]): SlotLayout {
  const slots = events
    .filter((e) => e.extendedProps?.type === 'slot' && e.start && e.end)
    .map((e) => ({
      id: e.id,
      start: dayjs(e.start).valueOf(),
      end: dayjs(e.end).valueOf(),
    }))
    .sort((a, b) => {
      const diff = a.start - b.start
      if (diff !== 0) {
        return diff
      }
      // Longer events first so they get column 0
      return b.end - b.start - (a.end - a.start)
    })

  const result: SlotLayout = new Map()

  const columnEnds: number[] = []
  let group: { id: string; column: number }[] = []
  let groupMaxEnd = Number.NEGATIVE_INFINITY
  let groupMaxColumn = 0

  const flushGroup = () => {
    const totalColumns = groupMaxColumn + 1
    for (const { id, column } of group) {
      result.set(id, { column, totalColumns })
    }
  }

  for (const slot of slots) {
    // Commencer pile à la fin du groupe ne compte pas comme un chevauchement
    if (group.length > 0 && slot.start >= groupMaxEnd) {
      flushGroup()
      group = []
      groupMaxColumn = 0
      columnEnds.length = 0
    }

    // Greedy column assignment
    let column = columnEnds.findIndex((end) => end <= slot.start)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(slot.end)
    } else {
      columnEnds[column] = slot.end
    }

    group.push({ id: slot.id, column })
    groupMaxColumn = Math.max(groupMaxColumn, column)
    groupMaxEnd = Math.max(groupMaxEnd, slot.end)
  }

  if (group.length > 0) {
    flushGroup()
  }

  return result
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  color?: string
  contrastColor?: string
  className?: string
  display?: string
  editable?: boolean
  extendedProps?: {
    type?: string
    templateID?: string
    soignant?: string
    location?: string
    states?: string[]
    appointments?: Appointment[]
    locked?: boolean
    archived?: boolean
    conflicts?: string[]
    slotWeeks?: string[]
    thematic?: string
    secondaryTags?: string[]
  }
}

interface CalendarProps {
  events: CalendarEvent[]
  handleSelectEvent?: (arg: DateSelectInfo) => void
  handleEditEvent?: (arg: EventDropInfo | EventResizeDoneInfo) => void
  handleClickEvent?: (eventID: string) => void
  handleDropEvent?: (pathwayTemplateID: string, startDate: string) => void
  handleOpenEvent?: (eventId: string) => void
  selectAllow?: (selectInfo: DateSpanApi) => boolean
  editMode?: boolean
  /** complete : vues, aujourd'hui, date ; navigation : sans les vues ; minimale : précédent/suivant. */
  barre?: 'complete' | 'navigation' | 'minimale'
  classeBarre?: string
  editable?: boolean
  /** false : les créneaux simultanés se partagent la colonne au lieu de se recouvrir. */
  overlap?: boolean
  initialDate?: string
  forbiddenWeeks?: { id: string; startOfWeek: string }[]
  onForbiddenWeekCreate?: (date: string) => void
  onForbiddenWeekDelete?: (id: string) => void
  onDuplicate?: (eventId: string) => void
  onDelete?: (eventId: string) => void
  onToggleLock?: (eventId: string, locked: boolean) => void
  selectedSlotIds?: Set<string>
  onToggleSelect?: (eventId: string) => void
  /** Tags secondaires du parcours, affichés sur le créneau. */
  showSecondaryTags?: boolean
  unselectRef?: React.MutableRefObject<(() => void) | null>
  weekAnchorDate?: string
  /** Cycle de numérotation du service ; absent = numéros de semaine ISO. */
  planningCycle?: PlanningCycle | null
  /** Notifie la plage réellement affichée, pour ne charger que celle-ci. */
  onRangeChange?: (range: { from: string; to: string }) => void
  initialView?: string
  onViewChange?: (view: string) => void
  /** Faux : la période affichée n'écrase pas celle mémorisée du planning. */
  saveDates?: boolean
}

function Calendar({
  events,
  handleSelectEvent,
  handleEditEvent,
  handleDropEvent,
  handleClickEvent,
  handleOpenEvent,
  selectAllow,
  editMode,
  barre = 'complete',
  classeBarre,
  editable = false,
  overlap = true,
  initialDate,
  forbiddenWeeks = [],
  onForbiddenWeekCreate,
  onForbiddenWeekDelete,
  onDuplicate,
  onDelete,
  onToggleLock,
  selectedSlotIds,
  onToggleSelect,
  showSecondaryTags = true,
  unselectRef,
  weekAnchorDate,
  planningCycle,
  onRangeChange,
  initialView = 'timeGridWeek',
  onViewChange,
  saveDates = true,
}: CalendarProps) {
  const anchorMonday = useMemo(
    () =>
      weekAnchorDate
        ? dayjs.utc(weekAnchorDate).isoWeekday(1).startOf('day')
        : null,
    [weekAnchorDate],
  )
  const lastDropTimeRef = useRef<number>(0)
  const calendarRef = useRef<CalendarRef | null>(null)
  const controller = useCalendarController()

  useEffect(() => {
    if (unselectRef) {
      unselectRef.current = () => calendarRef.current?.getApi().unselect()
    }
  }, [unselectRef])
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [currentView, setCurrentView] = useState(initialView)
  const [currentViewStart, setCurrentViewStart] = useState<string>('')

  const slotLayout = useMemo(
    () =>
      events.some((e) => e.display === 'background')
        ? computeSlotLayout(events)
        : EMPTY_SLOT_LAYOUT,
    [events],
  )

  /**
   * Les colonnes des créneaux en fond sont posées en styles inline, que
   * FullCalendar ne remet pas à zéro. Sans ce balayage, un créneau garde la
   * largeur d'un groupe auquel il n'appartient plus dès que la liste
   * d'événements change (changement de filtre, par exemple).
   */
  const applySlotLayout = useCallback(() => {
    const elements =
      document.querySelectorAll<HTMLElement>('[data-slot-id]') ?? []

    for (const element of elements) {
      const slotId = element.getAttribute('data-slot-id')
      const layout = slotId ? slotLayout.get(slotId) : undefined

      if (!layout || layout.totalColumns <= 1) {
        element.style.width = ''
        element.style.left = ''
        continue
      }

      const width = 100 / layout.totalColumns
      element.style.width = `${width}%`
      element.style.left = `${layout.column * width}%`
    }
  }, [slotLayout])

  useEffect(() => {
    applySlotLayout()
  }, [applySlotLayout])

  // In day-grid/list views, background events are hidden by FullCalendar.
  // Override display to 'auto' so slots remain visible in those views.
  const viewEvents = useMemo(() => {
    if (currentView.startsWith('timeGrid')) {
      return events
    }
    return events.map((e) =>
      e.display === 'background' ? { ...e, display: 'auto' as const } : e,
    )
  }, [events, currentView])

  const seancesParJour = useMemo(() => {
    const parJour = new Map<string, number>()
    for (const e of events) {
      const jour = dayjs.utc(e.start).format('YYYY-MM-DD')
      parJour.set(jour, (parJour.get(jour) ?? 0) + 1)
    }
    return parJour
  }, [events])

  const showDayEmptyState = useMemo(() => {
    if (currentView !== 'timeGridDay' || !currentViewStart) {
      return false
    }
    const dayStart = dayjs(currentViewStart).startOf('day')
    const dayEnd = dayStart.endOf('day')
    return !events.some(
      (e) => dayjs(e.start).isBefore(dayEnd) && dayjs(e.end).isAfter(dayStart),
    )
  }, [currentView, currentViewStart, events])

  const forbiddenWeekEvents = useMemo(() => {
    return forbiddenWeeks.map((fw) => ({
      id: `forbidden_${fw.id}`,
      start: fw.startOfWeek,
      end: dayjs(fw.startOfWeek).add(7, 'day').toISOString(),
      display: 'background' as const,
      color: 'rgba(239, 68, 68, 0.15)',
    }))
  }, [forbiddenWeeks])

  const handleDateChange = (date: Dayjs | null) => {
    if (!date) {
      return
    }

    const api = calendarRef.current?.getApi() ?? null
    api?.gotoDate(date.toDate())
    setAnchorEl(null)
  }

  const handleSelect = (dateSelectArg: DateSelectInfo) => {
    handleSelectEvent?.(dateSelectArg)
  }

  const handleEventDrop = (eventDropArg: EventDropInfo) => {
    handleEditEvent?.(eventDropArg)
  }

  const handleResize = (eventResizeStopArg: EventResizeDoneInfo) => {
    handleEditEvent?.(eventResizeStopArg)
  }

  const clickedEventRef = useRef<string | null>(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) {
        return
      }

      if (target.closest('[data-event-action]')) {
        return
      }

      // Un rendez-vous est posé dans un créneau de fond, que FullCalendar ne
      // reconnaît pas comme un événement : sans ça le clic démarre une
      // sélection de dates, qui repeint le calendrier et avale le clic.
      if (target.closest('[data-appointment-id]')) {
        e.stopPropagation()
        return
      }

      const el = target.closest('.fc-event-hero')
      if (!el) {
        return
      }

      const eventID = el.getAttribute('data-event-id')
      if (!eventID) {
        return
      }

      clickedEventRef.current = eventID
    }

    const handleMouseUp = () => {
      const clicked = clickedEventRef.current
      if (!clicked) {
        return
      }

      clickedEventRef.current = null
      if (!isDraggingRef.current) {
        handleClickEvent?.(clicked)
      }
    }

    // Capture : il faut court-circuiter FullCalendar, qui écoute plus bas.
    document.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleClickEvent])

  // La v7 sépare le rendu des événements de fond : les créneaux en sont, et portent le même contenu.
  const renduEvenement = (eventContent: EventDisplayInfo) => {
    const contenu = (
      <EventContent
        setOpenEventId={handleOpenEvent}
        eventContent={eventContent}
        editMode={editMode}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleLock={onToggleLock}
        selectedSlotIds={selectedSlotIds}
        onToggleSelect={onToggleSelect}
        showSecondaryTags={showSecondaryTags}
      />
    )
    // En vue liste, le contenu remplace toute la ligne : l'horaire n'y est plus que s'il est rendu ici.
    if (!eventContent.view.type.startsWith('list')) {
      return contenu
    }
    return (
      <div className="flex w-full items-center gap-4">
        <span className="w-24 shrink-0 text-[13px] font-medium tabular-nums text-text-dark">
          {eventContent.timeText}
        </span>
        <div className="min-w-0 flex-1">{contenu}</div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      <BarreCalendrier
        controller={controller}
        vues={
          barre === 'complete'
            ? [
                { type: 'timeGridWeek' },
                { type: 'timeGridDay' },
                { type: 'listWeek' },
              ]
            : undefined
        }
        aujourdhui={barre !== 'minimale'}
        onChoisirDate={barre === 'minimale' ? undefined : setAnchorEl}
        className={classeBarre}
      />
      <FullCalendar
        ref={calendarRef}
        controller={controller}
        plugins={[breezyTheme, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={initialView}
        initialDate={
          initialDate || anchorMonday?.toISOString() || dayjs().toISOString()
        }
        validRange={anchorMonday ? { start: anchorMonday.toDate() } : undefined}
        locale={frLocale}
        timeZone={'UTC'}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        weekends={false}
        allDaySlot={false}
        selectMirror={true}
        selectable={!!handleSelectEvent}
        selectOverlap={true}
        unselectAuto={true}
        nowIndicator={true}
        headerToolbar={false}
        titleFormat={(arg) => {
          const start = dayjs.utc(arg.start.marker)
          if (anchorMonday) {
            const weekNum =
              start.startOf('isoWeek').diff(anchorMonday, 'week') + 1
            return `Semaine ${weekNum}`
          }
          // Cycle du service s'il est configuré, numéro ISO sinon.
          const cycleWeek = planningCycle
            ? cycleWeekNumber(start, planningCycle)
            : undefined
          const weekLabel =
            cycleWeek === undefined
              ? `s${start.isoWeek()}`
              : cycleWeek === null
                ? 'Fermée'
                : `S${cycleWeek}`
          const startStr = start.format('DD MMMM')
          if (!arg.end) {
            return `${weekLabel} / ${startStr}`
          }
          // arg.end.marker est la fin INCLUSIVE de la plage (23:59:59.999 du
          // dernier jour visible), donc on n'enlève pas de jour.
          const end = dayjs.utc(arg.end.marker)
          // Vue "Jour" (plage d'un seul jour) : afficher le jour seul.
          if (end.isSame(start, 'day')) {
            return `${weekLabel} / ${startStr}`
          }
          return `${weekLabel} / ${startStr} - ${end.format('DD MMMM')}`
        }}
        dayHeaderFormat={
          anchorMonday
            ? { weekday: 'long' }
            : { weekday: 'short', day: 'numeric' }
        }
        // Le thème met les heures en capitales et dans son gris le plus pâle, à peine lisible.
        slotHeaderInnerClass="normal-case text-text-light"
        // La hauteur d'une demi-heure de la v6 : plus serrés, les créneaux tronquent leur texte.
        slotMinHeight={35}
        dayLaneClass={(info) => (info.isToday ? 'bg-primary/8' : undefined)}
        // Pas de cadre autour du calendrier, la carte de l'écran l'entoure déjà. En mode
        // édition, la vue s'encadre de rouge.
        viewClass={cn(
          'rounded-none border-0',
          editMode &&
            'relative before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:rounded-md before:shadow-[inset_0_0_0_2px_var(--color-destructive)]',
        )}
        // Vue liste, faite pour balayer une semaine : chaque jour en bandeau sur toute la largeur,
        // puis ses séances en lignes serrées, séparées d'un filet plutôt qu'encadrées.
        listDaysClass="my-0 max-w-none px-0"
        listDayClass="flex-col items-stretch gap-0 border-b-0"
        listDayHeaderClass="sticky top-0 z-20 w-full max-w-none bg-card px-4 py-1.5"
        // Sans la pastille du thème sur aujourd'hui : l'accent est la couleur du libellé.
        listDayHeaderInnerClass="rounded-none bg-transparent p-0"
        // Le thème rend l'en-tête en deux niveaux (format principal et secondaire) : un seul suffit.
        listDayHeaderContent={(info) =>
          info.level > 0 ? null : (
            <EnteteJourListe
              date={info.date}
              aujourdhui={info.isToday}
              seances={seancesParJour.get(toUtcDay(info.date)) ?? 0}
            />
          )
        }
        listDayBodyClass="m-0 w-full rounded-none border-0"
        listItemEventClass="rounded-none border-0 border-b border-border/70 bg-transparent px-4 py-1 last:border-b-0 hover:bg-card/60"
        slotHeaderFormat={(arg) => {
          const hour = arg.date.hour.toString()
          const minute = arg.date.minute.toString().padStart(2, '0')
          return minute === '00' ? `${hour}h` : `${hour}:${minute}`
        }}
        height="100%"
        scrollTimeReset={false}
        slotMinTime="06:00:00"
        slotDuration="00:30:00"
        slotHeaderInterval="01:00"
        snapDuration="00:15:00"
        editable={editable}
        select={handleSelect}
        dateClick={(info) => {
          if (!onForbiddenWeekCreate && !onForbiddenWeekDelete) {
            return
          }
          const clickedDate = dayjs(info.date)
          const matchingForbiddenWeek = forbiddenWeeks.find((fw) => {
            const start = dayjs(fw.startOfWeek)
            return (
              (clickedDate.isSame(start) || clickedDate.isAfter(start)) &&
              clickedDate.isBefore(start.add(7, 'day'))
            )
          })
          if (matchingForbiddenWeek) {
            onForbiddenWeekDelete?.(matchingForbiddenWeek.id)
          } else {
            onForbiddenWeekCreate?.(info.dateStr)
          }
        }}
        eventDrop={handleEventDrop}
        eventResize={handleResize}
        eventDragStart={() => {
          isDraggingRef.current = true
        }}
        eventDragStop={() => {
          setTimeout(() => {
            isDraggingRef.current = false
          }, 0)
        }}
        eventResizeStart={() => {
          isDraggingRef.current = true
        }}
        eventResizeStop={() => {
          setTimeout(() => {
            isDraggingRef.current = false
          }, 0)
        }}
        events={[...viewEvents, ...forbiddenWeekEvents]}
        slotEventOverlap={overlap}
        eventContent={renduEvenement}
        backgroundEventContent={renduEvenement}
        // Le thème teinte les événements à partir de leur couleur : créneaux, rendez-vous et
        // semaines interdites gardent la leur, pleine (elle porte son alpha quand il en faut un).
        backgroundEventClass={(info) =>
          cn('bg-[var(--fc-event-color)] opacity-100', bordureCreneau(info))
        }
        // Sans les marges du thème : notre contenu a les siennes, et une demi-heure en a besoin.
        columnEventClass={(info) =>
          cn('m-0 bg-[var(--fc-event-color)]', bordureCreneau(info))
        }
        columnEventInnerClass="p-0"
        noEventsContent={() => (
          <NoEventsState label="Aucune séance planifiée cette semaine" />
        )}
        datesSet={(arg) => {
          setCurrentView(arg.view.type)
          onViewChange?.(arg.view.type)
          setCurrentViewStart(arg.view.currentStart.toISOString())
          if (saveDates) {
            usePlanningStore.getState().setPlanningDates({
              currentDate: arg.startStr,
              viewStart: arg.view.currentStart.toISOString(),
              viewEnd: arg.view.currentEnd.toISOString(),
            })
          }
          // arg.start/end, pas currentStart/End : ils incluent les jours
          // débordant de la période et réellement rendus. Fin exclusive.
          onRangeChange?.({
            from: toUtcDay(arg.start),
            to: toUtcDay(arg.end),
          })
        }}
        selectAllow={selectAllow}
        eventReceive={undefined}
        drop={(info) => {
          const now = Date.now()
          const THROTTLE_MS = 500
          if (now - lastDropTimeRef.current < THROTTLE_MS) {
            return
          }
          lastDropTimeRef.current = now

          const pathwayId = info.draggedEl.getAttribute('data-pathway-id')
          const startDate = info.date
          const weekStart = dayjs(startDate).isoWeekday(1).utc().startOf('day')
          if (pathwayId) {
            handleDropEvent?.(pathwayId, weekStart.toISOString())
          }
        }}
        backgroundEventDidMount={(info) => {
          info.el.setAttribute('data-slot-id', info.event.id)
          // Repose aussi les colonnes des voisins déjà montés du groupe.
          applySlotLayout()
        }}
      />

      {showDayEmptyState && (
        <div className="absolute inset-x-0 bottom-0 top-[68px] flex items-center justify-center pointer-events-none z-10">
          <NoEventsState label="Aucune séance planifiée ce jour" />
        </div>
      )}

      <CalendarDatePickerButton
        anchorEl={anchorEl}
        setAnchorEl={setAnchorEl}
        onChange={handleDateChange}
        value={
          anchorEl
            ? dayjs.utc(calendarRef.current?.getApi().getDate())
            : undefined
        }
      />
    </div>
  )
}

// Les créneaux (className « fc-slot » de buildSlotEvents) se séparent de leurs voisins dans la
// grille ; en liste, le filet entre les lignes suffit.
const bordureCreneau = (info: EventDisplayInfo) =>
  info.event.className.includes('fc-slot')
    ? 'rounded-[5px] border-[1.5px] border-black/10'
    : undefined

function EnteteJourListe({
  date,
  aujourdhui,
  seances,
}: {
  date: Date
  aujourdhui: boolean
  seances: number
}) {
  const jour = dayjs.utc(date)
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <span
        className={cn(
          'whitespace-nowrap font-semibold first-letter:uppercase',
          aujourdhui ? 'text-primary' : 'text-text-dark',
        )}
      >
        {jour.format('dddd D MMMM')}
      </span>
      <span className="text-text-light">
        {seances} séance{seances > 1 ? 's' : ''}
      </span>
    </div>
  )
}

function NoEventsState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border">
        <CalendarOff className="h-5 w-5 text-text-light" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text-dark">Aucune séance</p>
        <p className="text-xs text-text-light mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default Calendar
