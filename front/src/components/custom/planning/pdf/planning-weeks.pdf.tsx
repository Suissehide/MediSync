import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { getContrastTextColor } from '../../../../libs/color.ts'
import type { Slot } from '../../../../types/slot.ts'
import type { PlanningWeek } from './planning-pdf.utils.ts'

const PAGE_PADDING = 22
const DAY_HEADER_HEIGHT = 24

// Les lignes d'horaires se partagent la hauteur restante de la page : plutôt
// que d'estimer la hauteur de l'en-tête à la main, on laisse flexbox la mesurer
// et répartir le reste. Le plancher garde une ligne lisible quand la semaine en
// compte beaucoup ; le plafond évite la bande géante quand elle n'en a qu'une.
const MIN_ROW_HEIGHT = 32
const MAX_ROW_HEIGHT = 170

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
  timeRow: {
    flexDirection: 'row',
    flexGrow: 1,
    flexBasis: 0,
    minHeight: MIN_ROW_HEIGHT,
    maxHeight: MAX_ROW_HEIGHT,
  },
  timeLabelCell: {
    width: 54,
    backgroundColor: '#f9fafb',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeLabelText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    textAlign: 'center',
  },
  dayCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    padding: 1.5,
  },
  slotBlock: {
    // `flexBasis: 'auto'` — avec une base à 0, react-pdf mesure le bloc avant
    // son contenu et le texte disparaît dès qu'une case porte deux créneaux.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 3,
    marginBottom: 1.5,
  },
  slotThematic: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  slotSoignants: {
    fontSize: 7.5,
    marginTop: 1,
  },
  slotLocation: {
    fontSize: 7,
    marginTop: 1,
  },
})

function SlotBlock({ slot }: { slot: Slot }) {
  const background =
    slot.slotTemplate?.color ??
    slot.pathway?.template?.color ??
    DEFAULT_SLOT_COLOR
  const color = getContrastTextColor(background)
  const soignants = slot.slotTemplate?.soignants
    ?.map((soignant) => soignant.name)
    .join(', ')
  const location = slot.slotTemplate?.location?.name

  return (
    <View style={[styles.slotBlock, { backgroundColor: background }]}>
      <Text style={[styles.slotThematic, { color }]}>
        {slot.slotTemplate?.thematic ?? 'Sans thématique'}
      </Text>
      {soignants && (
        <Text style={[styles.slotSoignants, { color }]}>{soignants}</Text>
      )}
      {location && (
        <Text style={[styles.slotLocation, { color }]}>{location}</Text>
      )}
    </View>
  )
}

function WeekPage({ week }: { week: PlanningWeek }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Semaine {week.isoWeek}</Text>
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

      {week.timeRows.length === 0 ? (
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

          {week.timeRows.map((row) => (
            <View key={row.timeLabel} style={styles.timeRow} wrap={false}>
              <View style={styles.timeLabelCell}>
                <Text style={styles.timeLabelText}>{row.timeLabel}</Text>
              </View>
              {row.cells.map((slots, dayIndex) => (
                <View key={DAY_NAMES[dayIndex]} style={styles.dayCell}>
                  {slots.map((slot) => (
                    <SlotBlock key={slot.id} slot={slot} />
                  ))}
                </View>
              ))}
            </View>
          ))}
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
