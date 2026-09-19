import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { Slot } from '../../../../../types/slot.ts'
import {
  buildCalendarEntries,
  type ClosureData,
  type NoticeData,
  type WeekData,
} from '../programme-pdf.utils.ts'

const PAGE_PADDING = 28
const A4_HEIGHT = 841.89
const PAGE_CONTENT_HEIGHT = A4_HEIGHT - PAGE_PADDING * 2

// Majorants de hauteur : l'en-tête d'une semaine, une ligne d'horaire (le
// libellé d'un créneau peut passer à la ligne et dépasser le `minHeight` de 36)
// et la marge basse d'un bloc.
const WEEK_HEADER_MAX_HEIGHT = 30
const TIME_ROW_MAX_HEIGHT = 60
const WEEK_BLOCK_MARGIN_BOTTOM = 14

// Sans `wrap={false}`, react-pdf coupe volontiers la page juste après la ligne
// d'en-tête et laisse le titre du tableau orphelin en bas de page. On garde
// donc chaque semaine d'un seul tenant, sauf si elle est trop haute pour tenir
// sur une page : `wrap={false}` la ferait alors tronquer.
function weekFitsOnOnePage(rowCount: number) {
  const height =
    WEEK_HEADER_MAX_HEIGHT +
    rowCount * TIME_ROW_MAX_HEIGHT +
    WEEK_BLOCK_MARGIN_BOTTOM
  return height <= PAGE_CONTENT_HEIGHT
}

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
    width: 52,
    backgroundColor: '#f9a8d4',
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekLabelText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#be185d',
    textAlign: 'center',
  },
  dayHeaderCell: {
    flex: 1,
    backgroundColor: '#c4b5fd',
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  dayHeaderName: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#4c1d95',
    textAlign: 'center',
  },
  dayHeaderDate: {
    fontSize: 7,
    color: '#5b21b6',
    textAlign: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    minHeight: 36,
  },
  timeLabelCell: {
    width: 52,
    backgroundColor: '#fce7f3',
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeLabelText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#be185d',
    textAlign: 'center',
  },
  slotCell: {
    flex: 1,
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
  },
  slotCellFilled: {
    backgroundColor: '#fdf4ff',
  },
  slotCellEmpty: {
    backgroundColor: '#f9fafb',
  },
  slotThematic: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
  },
  slotLocation: {
    fontSize: 6,
    color: '#7c3aed',
    marginTop: 1,
  },
})

const DAY_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

function WeekBlock({ weekData }: { weekData: WeekData }) {
  return (
    <View
      style={styles.weekBlock}
      wrap={!weekFitsOnOnePage(weekData.timeRows.length)}
    >
      <View style={styles.weekHeaderRow} wrap={false}>
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

      {weekData.timeRows.map((row) => (
        <View key={row.timeLabel} style={styles.timeRow} wrap={false}>
          <View style={styles.timeLabelCell}>
            <Text style={styles.timeLabelText}>{row.timeLabel}</Text>
          </View>
          {row.cells.map((slot, dayIdx) => (
            <View
              key={DAY_NAMES[dayIdx]}
              style={[
                styles.slotCell,
                slot ? styles.slotCellFilled : styles.slotCellEmpty,
              ]}
            >
              {slot && (
                <>
                  <Text style={styles.slotThematic}>
                    {slot.slotTemplate?.thematic ?? ''}
                  </Text>
                  {slot.slotTemplate?.location?.name && (
                    <Text style={styles.slotLocation}>
                      {slot.slotTemplate.location.name}
                    </Text>
                  )}
                </>
              )}
            </View>
          ))}
        </View>
      ))}
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
          return <WeekBlock key={entry.weekLabel} weekData={entry} />
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
