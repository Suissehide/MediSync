import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { getContrastTextColor } from '../../../../libs/color.ts'
import {
  formatMinute,
  formatTimeRange,
  type PlacedSlot,
} from '../../../../libs/pdfTimeGrid.ts'
import type { PlanningWeek } from './planning-pdf.utils.ts'

const PAGE_PADDING = 22
const DAY_HEADER_HEIGHT = 24

// Hauteur de l'axe horaire une fois l'en-tête et la ligne des jours posés,
// mesurée sur un rendu réel. react-pdf pagine avant de résoudre flexbox :
// c'est cette hauteur explicite qui garantit une semaine par page.
const AVAILABLE_ROWS_HEIGHT = 496

// Tailles de police à densité confortable, et hauteur qu'occupent les
// trois lignes d'un créneau à cette échelle (interligne ~1,25, marges et bordures).
const BASE_FONT_SIZES = { thematic: 8.5, details: 7.5 }
const BASE_BLOCK_HEIGHT = 38
const TIME_LABEL_SIZE = 7
const MIN_FONT_SCALE = 0.55

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
    fontFamily: 'Helvetica-Bold',
    textOverflow: 'ellipsis',
  },
  slotDetails: {
    marginTop: 1,
    // Une seule ligne, tronquée proprement : sans cela le texte repart à la
    // ligne et `overflow: 'hidden'` le coupe en plein milieu d'un mot.
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
})

/** Plus un créneau est court, plus sa police est petite, pour que ses deux lignes y tiennent. */
function computeFontScale(height: number) {
  return Math.max(MIN_FONT_SCALE, Math.min(1, height / BASE_BLOCK_HEIGHT))
}

function SlotBlock({ placed, height }: { placed: PlacedSlot; height: number }) {
  const { slot } = placed
  const fontScale = computeFontScale(height)
  const thematicMaxLines = height >= BASE_BLOCK_HEIGHT * 1.5 ? 2 : 1
  const background =
    slot.slotTemplate?.color ??
    slot.pathway?.template?.color ??
    DEFAULT_SLOT_COLOR
  const color = getContrastTextColor(background)
  const soignants = slot.slotTemplate?.soignants
    ?.map((soignant) => soignant.name)
    .join(', ')
  const location = slot.slotTemplate?.location?.name
  // Soignants et salle sur une seule ligne : en hauteur, chaque ligne gagnée
  // permet une police plus grande sur une semaine dense.
  const details = [soignants, location].filter(Boolean).join(' - ')
  const detailsFontSize = BASE_FONT_SIZES.details * fontScale

  return (
    <View style={[styles.slotBlock, { backgroundColor: background }]}>
      <Text style={{ color, fontSize: detailsFontSize }}>
        {formatTimeRange(placed)}
      </Text>
      <Text
        style={[
          styles.slotThematic,
          {
            color,
            fontSize: BASE_FONT_SIZES.thematic * fontScale,
            maxLines: thematicMaxLines,
          },
        ]}
      >
        {slot.slotTemplate?.thematic ?? 'Sans thématique'}
      </Text>
      {details && height >= BASE_BLOCK_HEIGHT * 0.8 && (
        <Text
          style={[styles.slotDetails, { color, fontSize: detailsFontSize }]}
        >
          {details}
        </Text>
      )}
    </View>
  )
}

function WeekPage({ week }: { week: PlanningWeek }) {
  const minuteHeight =
    AVAILABLE_ROWS_HEIGHT / (week.endMinute - week.startMinute)
  const topOf = (minute: number) => (minute - week.startMinute) * minuteHeight
  const hours = Array.from(
    { length: (week.endMinute - week.startMinute) / 60 + 1 },
    (_, index) => week.startMinute + index * 60,
  )

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
              {hours.map((minute, index) => (
                <Text
                  key={minute}
                  style={[
                    styles.timeLabelText,
                    // Le libellé est centré sur son trait, sauf aux deux bouts de l'axe.
                    {
                      top: Math.min(
                        Math.max(topOf(minute) - TIME_LABEL_SIZE / 2, 1),
                        AVAILABLE_ROWS_HEIGHT - TIME_LABEL_SIZE - 3,
                      ),
                    },
                  ]}
                >
                  {index === 0 || index === hours.length - 1
                    ? ''
                    : formatMinute(minute)}
                </Text>
              ))}
            </View>
            {week.days.map((day, dayIndex) => (
              <View key={DAY_NAMES[dayIndex]} style={styles.dayColumn}>
                {hours.slice(1, -1).map((minute) => (
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
