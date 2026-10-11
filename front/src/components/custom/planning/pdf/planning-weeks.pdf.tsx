import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { getContrastTextColor } from '../../../../libs/color.ts'
import {
  formatMinute,
  formatTimeRange,
  innerHours,
  type PlacedSlot,
} from '../../../../libs/pdfTimeGrid.ts'
import type { PlanningWeek } from './planning-pdf.utils.ts'

const PAGE_PADDING = 22
const DAY_HEADER_HEIGHT = 24

// Hauteur de l'axe horaire une fois l'en-tête et la ligne des jours posés,
// mesurée sur un rendu réel. react-pdf pagine avant de résoudre flexbox :
// c'est cette hauteur explicite qui garantit une semaine par page.
const AVAILABLE_ROWS_HEIGHT = 496

// Même police pour tous les créneaux ; un créneau trop court perd ses
// dernières lignes plutôt que de rapetisser. Hauteurs de ligne = police × 1,2.
const SLOT_FONT_SIZES = { time: 5.5, thematic: 7, details: 6 }
const SLOT_LINE_HEIGHTS = { time: 6.6, thematic: 8.4, details: 7.2 }
const SLOT_CHROME = 4.5
// Largeur utile d'un jour : page A4 paysage moins marges et colonne des heures.
const DAY_COLUMN_WIDTH = (841.89 - 2 * PAGE_PADDING - 54) / 5
const SLOT_HORIZONTAL_CHROME = 7.5
// Largeur moyenne d'un caractère Helvetica, arrondie haut : surestimer ne fait
// que réserver une ligne de trop.
const CHAR_WIDTH_RATIO = 0.55
const TIME_LABEL_SIZE = 7

const DAY_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

const DEFAULT_SLOT_COLOR = '#94a3b8'

const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontFamily: 'Helvetica',
    color: '#1f2937',
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
  },
  closureBlock: {
    flexShrink: 0,
    paddingVertical: 6,
    marginBottom: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 0.5,
    borderColor: '#fecaca',
  },
  closureText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#b91c1c',
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 12,
  },
  grid: {
    flexGrow: 1,
    flexDirection: 'column',
  },
  dayHeaderRow: {
    flexShrink: 0,
    flexDirection: 'row',
    height: DAY_HEADER_HEIGHT,
  },
  cornerCell: {
    width: 54,
    backgroundColor: '#f3f4f6',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
  },
  dayHeaderCell: {
    flex: 1,
    backgroundColor: '#e0e7ff',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayHeaderName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#312e81',
  },
  dayHeaderDate: {
    fontSize: 7.5,
    color: '#4338ca',
  },
  timeBody: {
    flexDirection: 'row',
    height: AVAILABLE_ROWS_HEIGHT,
  },
  timeAxis: {
    width: 54,
    backgroundColor: '#f9fafb',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
  },
  timeLabelText: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: TIME_LABEL_SIZE,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    textAlign: 'center',
  },
  dayColumn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#d1d5db',
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
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  slotThematic: {
    fontSize: SLOT_FONT_SIZES.thematic,
    fontFamily: 'Helvetica-Bold',
    textOverflow: 'ellipsis',
  },
  slotTime: {
    fontSize: SLOT_FONT_SIZES.time,
  },
  slotDetails: {
    fontSize: SLOT_FONT_SIZES.details,
    // `maxLines` posé par créneau : au-delà, troncature propre plutôt qu'un
    // texte coupé en plein milieu par `overflow: 'hidden'`.
    textOverflow: 'ellipsis',
  },
})

function estimateLines(text: string, fontSize: number, laneCount: number) {
  const width = DAY_COLUMN_WIDTH / laneCount - SLOT_HORIZONTAL_CHROME
  return Math.max(
    1,
    Math.ceil((text.length * fontSize * CHAR_WIDTH_RATIO) / width),
  )
}

function SlotBlock({ placed, height }: { placed: PlacedSlot; height: number }) {
  const { slot } = placed
  const background =
    slot.slotTemplate?.color ??
    slot.pathway?.template?.color ??
    DEFAULT_SLOT_COLOR
  const color = getContrastTextColor(background)
  const soignants = slot.slotTemplate?.soignants
    ?.map((soignant) => soignant.name)
    .join(', ')
  const location = slot.slotTemplate?.location?.name

  // Au-delà de trois colonnes, l'horaire passe sur deux lignes.
  let free =
    height -
    SLOT_CHROME -
    (placed.laneCount > 3 ? 2 : 1) * SLOT_LINE_HEIGHTS.time -
    SLOT_LINE_HEIGHTS.thematic
  const takeLines = (wanted: number, lineHeight: number) => {
    const lines = Math.min(wanted, Math.floor(free / lineHeight))
    free -= lines * lineHeight
    return lines
  }
  // Priorité quand la place manque : soignants, puis salle, puis la suite de
  // la thématique. La salle passe à la ligne au lieu d'être tronquée.
  const soignantsLines = soignants ? takeLines(1, SLOT_LINE_HEIGHTS.details) : 0
  const locationLines = location
    ? takeLines(
        estimateLines(location, SLOT_FONT_SIZES.details, placed.laneCount),
        SLOT_LINE_HEIGHTS.details,
      )
    : 0
  const thematicLines = 1 + Math.floor(free / SLOT_LINE_HEIGHTS.thematic)

  return (
    <View style={[styles.slotBlock, { backgroundColor: background }]}>
      <Text style={[styles.slotTime, { color }]}>
        {formatTimeRange(placed)}
      </Text>
      <Text style={[styles.slotThematic, { color, maxLines: thematicLines }]}>
        {slot.slotTemplate?.thematic ?? 'Sans thématique'}
      </Text>
      {soignantsLines > 0 && (
        <Text style={[styles.slotDetails, { color, maxLines: 1 }]}>
          {soignants}
        </Text>
      )}
      {locationLines > 0 && (
        <Text style={[styles.slotDetails, { color, maxLines: locationLines }]}>
          {location}
        </Text>
      )}
    </View>
  )
}

function WeekPage({ week }: { week: PlanningWeek }) {
  const minuteHeight =
    AVAILABLE_ROWS_HEIGHT / (week.endMinute - week.startMinute)
  const topOf = (minute: number) => (minute - week.startMinute) * minuteHeight
  const hours = innerHours(week.startMinute, week.endMinute)

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Semaine {week.weekLabel}</Text>
        <Text style={styles.subtitle}>
          du {week.weekStart.format('DD/MM/YYYY')} au{' '}
          {week.weekStart.add(4, 'day').format('DD/MM/YYYY')}
        </Text>
      </View>

      {week.isClosed && (
        <View style={styles.closureBlock}>
          <Text style={styles.closureText}>
            Service fermé — semaine interdite
          </Text>
        </View>
      )}

      {week.days.every((day) => day.length === 0) ? (
        // Sur une semaine fermée, la mention de fermeture dit déjà tout.
        !week.isClosed && (
          <Text style={styles.emptyMessage}>Aucun créneau cette semaine.</Text>
        )
      ) : (
        <View style={styles.grid}>
          <View style={styles.dayHeaderRow} wrap={false}>
            <View style={styles.cornerCell} />
            {DAY_NAMES.map((name, dayIndex) => (
              <View key={name} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderName}>{name}</Text>
                <Text style={styles.dayHeaderDate}>
                  {week.weekStart.add(dayIndex, 'day').format('DD/MM')}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.timeBody} wrap={false}>
            <View style={styles.timeAxis}>
              {hours.map((minute) => (
                <Text
                  key={minute}
                  style={[
                    styles.timeLabelText,
                    // Le libellé est centré sur son trait, sans déborder de l'axe.
                    {
                      top: Math.min(
                        Math.max(topOf(minute) - TIME_LABEL_SIZE / 2, 1),
                        AVAILABLE_ROWS_HEIGHT - TIME_LABEL_SIZE - 3,
                      ),
                    },
                  ]}
                >
                  {formatMinute(minute)}
                </Text>
              ))}
            </View>
            {week.days.map((day, dayIndex) => (
              <View key={DAY_NAMES[dayIndex]} style={styles.dayColumn}>
                {hours.map((minute) => (
                  <View
                    key={minute}
                    style={[styles.hourLine, { top: topOf(minute) }]}
                  />
                ))}
                {day.map((placed) => {
                  const height = (placed.end - placed.start) * minuteHeight
                  return (
                    <View
                      key={placed.slot.id}
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
                      <SlotBlock placed={placed} height={height} />
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      )}
    </Page>
  )
}

export default function PlanningWeeksPDF({ weeks }: { weeks: PlanningWeek[] }) {
  return (
    <Document>
      {weeks.map((week) => (
        <WeekPage key={week.weekStart.format('YYYY-MM-DD')} week={week} />
      ))}
    </Document>
  )
}
