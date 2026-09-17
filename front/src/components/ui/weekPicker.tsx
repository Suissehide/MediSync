import {
  DateCalendar,
  PickersDay,
  type PickersDayProps,
} from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { useEffect, useState } from 'react'

dayjs.extend(isoWeek)

/** Hauteur d'une ligne de semaine chez MUI : 36 px de jour + 2 × 2 px de marge. */
const WEEK_ROW_HEIGHT = 40

/**
 * Nombre de lignes de semaine qu'occupe un mois dans la grille.
 *
 * MUI rend la grille du mois en `position: absolute` dans un conteneur en
 * `position: relative` : elle ne contribue donc aucune hauteur à son parent, et
 * seule la `min-height` de ce conteneur lui en donne une. La valeur par défaut
 * réserve six lignes quel que soit le mois, d'où une bande vide sous les mois
 * qui n'en occupent que cinq — mais la passer à `auto` ferait tout s'effondrer.
 * On calcule donc la hauteur réellement nécessaire.
 */
function weekRowsInMonth(month: Dayjs): number {
  const firstRow = month.startOf('month').isoWeekday(1)
  const lastRow = month.endOf('month').isoWeekday(1)
  return lastRow.diff(firstRow, 'week') + 1
}

interface WeekPickerProps {
  value: Dayjs | null
  onChange: (date: Dayjs | null) => void
}

interface WeekDayExtraProps {
  selectedWeekStart: Dayjs | null
  hoveredWeekStart: Dayjs | null
}

function WeekDay(props: PickersDayProps & WeekDayExtraProps) {
  const { day, selectedWeekStart, hoveredWeekStart, ...other } = props

  const isInSelectedWeek =
    selectedWeekStart && day.isSame(selectedWeekStart, 'week')

  const isInHoveredWeek =
    hoveredWeekStart &&
    !isInSelectedWeek &&
    day.isSame(hoveredWeekStart, 'week')

  const isWeekStart = day.isoWeekday() === 1
  const isWeekEnd = day.isoWeekday() === 5
  const isWeekend = day.isoWeekday() > 5

  return (
    <PickersDay
      {...other}
      day={day}
      disableMargin
      selected={false}
      sx={{
        borderRadius: 0,
        transition: 'background-color 0.15s ease, color 0.15s ease',
        ...(isWeekStart && {
          borderTopLeftRadius: '20%',
          borderBottomLeftRadius: '20%',
        }),
        ...(isWeekEnd && {
          borderTopRightRadius: '20%',
          borderBottomRightRadius: '20%',
        }),
        ...(isInSelectedWeek &&
          !isWeekend && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 18%, transparent) !important',
            color: 'var(--primary) !important',
            fontWeight: '600 !important',
            '&:hover': {
              backgroundColor:
                'color-mix(in srgb, var(--primary) 25%, transparent) !important',
            },
          }),
        ...(isInHoveredWeek &&
          !isWeekend && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 8%, transparent)',
          }),
        ...(isWeekend &&
          isInSelectedWeek && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 8%, transparent) !important',
            color: 'var(--primary) !important',
          }),
        ...(isWeekend &&
          isInHoveredWeek && {
            backgroundColor:
              'color-mix(in srgb, var(--primary) 4%, transparent)',
          }),
      }}
    />
  )
}

export function WeekPicker({ value, onChange }: WeekPickerProps) {
  const [hoveredDay, setHoveredDay] = useState<Dayjs | null>(null)

  // Le mois affiché change de deux façons : par les flèches du calendrier
  // (`onMonthChange`) et par une sélection qui le déborde, y compris via les
  // boutons « Semaine précédente / suivante ». On suit les deux.
  const [visibleMonth, setVisibleMonth] = useState<Dayjs>(() => value ?? dayjs())
  useEffect(() => {
    if (value) {
      setVisibleMonth(value)
    }
  }, [value])

  const selectedWeekStart = value ? value.isoWeekday(1) : null
  const hoveredWeekStart = hoveredDay ? hoveredDay.isoWeekday(1) : null

  const selectPrevWeek = () => {
    const base = value ?? dayjs()
    onChange(base.isoWeekday(1).subtract(7, 'day'))
  }

  const selectNextWeek = () => {
    const base = value ?? dayjs()
    onChange(base.isoWeekday(1).add(7, 'day'))
  }

  return (
    <div className="flex flex-col items-center">
      <DateCalendar
        value={value}
        onChange={(date) => onChange(date)}
        timezone="UTC"
        onMonthChange={setVisibleMonth}
        showDaysOutsideCurrentMonth
        slots={{ day: WeekDay as React.ComponentType<PickersDayProps> }}
        slotProps={{
          day: ((ownerState: PickersDayProps) => ({
            selectedWeekStart,
            hoveredWeekStart,
            onPointerEnter: () => setHoveredDay(ownerState.day),
            onPointerLeave: () => setHoveredDay(null),
          })) as never,
        }}
        sx={{
          margin: 0,
          width: 280,
          // La grille des années porte en dur les 320 px de MUI, quelle que soit
          // la largeur du calendrier : dans une racine réduite à 280 px et mise
          // en `overflow: hidden`, sa dernière colonne était amputée de son
          // dernier chiffre. On la fait suivre la largeur du calendrier.
          '& .MuiYearCalendar-root': {
            width: '100%',
          },
          // Les jours portent `disableMargin` pour que la semaine sélectionnée
          // forme une bande continue. Sans le même retrait sur les libellés de
          // l'en-tête, ceux-ci gardent le pas de 40 px de MUI (36 px + 2 × 2 px
          // de marge) contre 36 px pour les jours : les deux lignes étant
          // centrées, elles s'écartent jusqu'à 12 px sur les colonnes de bord.
          '& .MuiDayCalendar-weekDayLabel': {
            width: 36,
            margin: 0,
          },
          // La racine a elle aussi une hauteur fixe (336 px) qu'il faut libérer,
          // sans quoi elle continuerait de réserver la place des six lignes.
          height: 'auto',
          '& .MuiDayCalendar-slideTransition': {
            minHeight: weekRowsInMonth(visibleMonth) * WEEK_ROW_HEIGHT,
          },
          '& .MuiPickersCalendarHeader-root': {
            paddingLeft: '16px',
            paddingRight: '8px',
          },
        }}
      />

      <div className="h-px w-full bg-border my-2" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={selectPrevWeek}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-dark hover:bg-muted transition-colors cursor-pointer whitespace-nowrap"
        >
          Semaine précédente
        </button>
        <button
          type="button"
          onClick={selectNextWeek}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-dark hover:bg-muted transition-colors cursor-pointer whitespace-nowrap"
        >
          Semaine suivante
        </button>
      </div>
    </div>
  )
}
