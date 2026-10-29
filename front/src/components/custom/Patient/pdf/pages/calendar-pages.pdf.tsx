import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { hexToRGBA } from '../../../../../libs/color.ts'
import {
  formatMinute,
  formatTimeRange,
  innerHours,
  type PlacedSlot,
} from '../../../../../libs/pdfTimeGrid.ts'
import type { Slot } from '../../../../../types/slot.ts'
import {
  buildCalendarEntries,
  type ClosureData,
  type NoticeData,
  type WeekData,
} from '../programme-pdf.utils.ts'

const PAGE_PADDING = 28
const WEEK_BLOCK_MARGIN_BOTTOM = 14
const LABEL_COLUMN_WIDTH = 52
// Une demi-heure garde ainsi la place de son horaire et de sa thématique.
const HOUR_HEIGHT = 44
// Hauteurs de ligne (police × ~1,2) et marges d'un rendez-vous, pour n'y
// écrire que ce qui tient : au-delà, react-pdf superpose les lignes.
const SLOT_TIME_LINE = 7.2
const SLOT_THEMATIC_LINE = 8.4
const SLOT_LOCATION_LINE = 7.2
const SLOT_CHROME = 5
const TIME_LABEL_SIZE = 7
// Meme repli que l'export du planning, pour un creneau hors parcours.
const DEFAULT_SLOT_COLOR = '#94a3b8'

const styles = StyleSheet.create({
  calendarPage: {
    padding: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1f2937',
  },
  emptyMessage: {
    fontSize: 10,
    color: '#9ca3af',
    fontStyle: 'italic',
    padding: 10,
  },
  weekBlock: {
    marginBottom: WEEK_BLOCK_MARGIN_BOTTOM,
  },
  closureBlock: {
    marginBottom: WEEK_BLOCK_MARGIN_BOTTOM,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
  },
  closureText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#4b5563',
    textAlign: 'center',
  },
  noticeBlock: {
    marginBottom: WEEK_BLOCK_MARGIN_BOTTOM,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fef9c3',
    borderWidth: 0.5,
    borderColor: '#fde047',
  },
  // Une consigne fait plusieurs lignes : alignée à gauche, elle se lit mieux
  // que centrée comme la mention de fermeture.
  noticeText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#713f12',
    lineHeight: 1.4,
  },
  weekHeaderRow: {
    flexDirection: 'row',
  },
  weekLabelCell: {
    width: LABEL_COLUMN_WIDTH,
    backgroundColor: '#e2e8f0',
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekLabelText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  dayHeaderCell: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  dayHeaderName: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    textAlign: 'center',
  },
  dayHeaderDate: {
    fontSize: 7,
    color: '#64748b',
    textAlign: 'center',
  },
  timeBody: {
    flexDirection: 'row',
  },
  timeAxis: {
    width: LABEL_COLUMN_WIDTH,
    backgroundColor: '#f8fafc',
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
  },
  timeLabelText: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: TIME_LABEL_SIZE,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    textAlign: 'center',
  },
  dayColumn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 0.5,
    borderColor: '#e5e7eb',
  },
  slotFrame: {
    position: 'absolute',
    padding: 0.75,
  },
  slotBlock: {
    flexGrow: 1,
    padding: 2,
    borderWidth: 0.75,
    overflow: 'hidden',
  },
  slotTime: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },
  slotThematic: {
    textOverflow: 'ellipsis',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
  },
  slotLocation: {
    fontSize: 6,
    color: '#64748b',
    marginTop: 1,
  },
})

const DAY_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

function WeekBlock({ weekData }: { weekData: WeekData }) {
  const { startMinute, endMinute } = weekData
  const bodyHeight = ((endMinute - startMinute) / 60) * HOUR_HEIGHT
  const topOf = (minute: number) => ((minute - startMinute) / 60) * HOUR_HEIGHT
  const hours = innerHours(startMinute, endMinute)

  return (
    // Sans `wrap={false}`, react-pdf coupe volontiers la page juste après la
    // ligne d'en-tête et laisse le titre du tableau orphelin en bas de page.
    <View style={styles.weekBlock} wrap={false}>
      <View style={styles.weekHeaderRow}>
        <View style={styles.weekLabelCell}>
          <Text style={styles.weekLabelText}>{weekData.weekLabel}</Text>
        </View>
        {DAY_NAMES.map((name, i) => {
          const date = weekData.weekStart.add(i, 'day')
          return (
            <View key={name} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderName}>{name}</Text>
              <Text style={styles.dayHeaderDate}>{date.format('DD/MM')}</Text>
            </View>
          )
        })}
      </View>

      <View style={[styles.timeBody, { height: bodyHeight }]}>
        <View style={styles.timeAxis}>
          {hours.map((minute) => (
            <Text
              key={minute}
              style={[
                styles.timeLabelText,
                // Centré sur son trait, sans déborder de l'axe.
                {
                  top: Math.min(
                    Math.max(topOf(minute) - TIME_LABEL_SIZE / 2, 1),
                    bodyHeight - TIME_LABEL_SIZE - 3,
                  ),
                },
              ]}
            >
              {formatMinute(minute)}
            </Text>
          ))}
        </View>
        {weekData.days.map((day, dayIdx) => (
          <View key={DAY_NAMES[dayIdx]} style={styles.dayColumn}>
            {hours.map((minute) => (
              <View
                key={minute}
                style={[styles.hourLine, { top: topOf(minute) }]}
              />
            ))}
            {day.map((placed) => (
              <SlotFrame key={placed.slot.id} placed={placed} topOf={topOf} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function SlotFrame({
  placed,
  topOf,
}: {
  placed: PlacedSlot
  topOf: (minute: number) => number
}) {
  const height = ((placed.end - placed.start) / 60) * HOUR_HEIGHT
  // Au-delà de deux colonnes, l'horaire passe sur deux lignes.
  const free =
    height - SLOT_CHROME - (placed.laneCount > 2 ? 2 : 1) * SLOT_TIME_LINE
  const location = placed.slot.slotTemplate?.location?.name
  const color = placed.slot.pathway?.template?.color ?? DEFAULT_SLOT_COLOR
  const showLocation =
    location && free >= SLOT_THEMATIC_LINE + SLOT_LOCATION_LINE
  const thematicLines = Math.max(
    1,
    Math.floor(
      (free - (showLocation ? SLOT_LOCATION_LINE : 0)) / SLOT_THEMATIC_LINE,
    ),
  )

  return (
    <View
      style={[
        styles.slotFrame,
        {
          top: topOf(placed.start),
          height,
          left: `${(placed.lane / placed.laneCount) * 100}%`,
          width: `${100 / placed.laneCount}%`,
        },
      ]}
    >
      <View
        style={[
          styles.slotBlock,
          { backgroundColor: hexToRGBA(color, 0.12), borderColor: color },
        ]}
      >
        <Text style={styles.slotTime}>{formatTimeRange(placed)}</Text>
        <Text style={[styles.slotThematic, { maxLines: thematicLines }]}>
          {placed.slot.slotTemplate?.thematic ?? ''}
        </Text>
        {showLocation && <Text style={styles.slotLocation}>{location}</Text>}
      </View>
    </View>
  )
}

function NoticeBlock({ notice }: { notice: NoticeData }) {
  return (
    <View style={styles.noticeBlock} wrap={false}>
      <Text style={styles.noticeText}>{notice.text}</Text>
    </View>
  )
}

function ClosureNotice({ closure }: { closure: ClosureData }) {
  return (
    <View style={styles.closureBlock} wrap={false}>
      <Text style={styles.closureText}>
        Service fermé du {closure.start.format('DD/MM/YYYY')} au{' '}
        {closure.end.format('DD/MM/YYYY')}
      </Text>
    </View>
  )
}

export default function CalendarPages({
  upcomingSlots,
  patientId,
  forbiddenWeekStarts,
  noticeByThematicId,
}: {
  upcomingSlots: Slot[]
  patientId?: string
  forbiddenWeekStarts?: string[]
  noticeByThematicId?: Map<string, string>
}) {
  const entries = buildCalendarEntries(
    upcomingSlots,
    patientId,
    forbiddenWeekStarts,
    noticeByThematicId,
  )

  if (entries.length === 0) {
    return (
      <Page size="A4" style={styles.calendarPage}>
        <Text style={styles.emptyMessage}>Aucun rendez-vous à venir.</Text>
      </Page>
    )
  }

  return (
    <Page size="A4" style={styles.calendarPage}>
      {entries.map((entry) => {
        if (entry.kind === 'week') {
          return (
            <WeekBlock
              key={entry.weekStart.format('YYYY-MM-DD')}
              weekData={entry}
            />
          )
        }
        if (entry.kind === 'notice') {
          return <NoticeBlock key={`consigne-${entry.id}`} notice={entry} />
        }
        return (
          <ClosureNotice
            key={`fermeture-${entry.start.format('YYYY-MM-DD')}`}
            closure={entry}
          />
        )
      })}
    </Page>
  )
}
