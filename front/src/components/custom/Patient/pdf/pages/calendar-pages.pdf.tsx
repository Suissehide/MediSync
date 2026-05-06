import {
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

import { SLOT_LOCATION } from '../../../../../constants/slot.constant.ts'
import type { Slot } from '../../../../../types/slot.ts'
import { getLabel, groupSlotsByWeek, type WeekData } from '../programme-pdf.utils.ts'

const styles = StyleSheet.create({
  calendarPage: {
    padding: 28,
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
    marginBottom: 14,
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

const PAGE_HEIGHT = 842 // A4 height in pt
const PAGE_PADDING = 28
const WEEK_MARGIN = 14
const HEADER_ROW_HEIGHT = 20
const TIME_ROW_HEIGHT = 36
const AVAILABLE_HEIGHT = PAGE_HEIGHT - PAGE_PADDING * 2

function estimateWeekHeight(week: WeekData): number {
  return HEADER_ROW_HEIGHT + week.timeRows.length * TIME_ROW_HEIGHT + WEEK_MARGIN
}

function WeekBlock({ weekData }: { weekData: WeekData }) {
  return (
    <View style={styles.weekBlock}>
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

      {weekData.timeRows.map((row) => (
        <View key={row.timeLabel} style={styles.timeRow}>
          <View style={styles.timeLabelCell}>
            <Text style={styles.timeLabelText}>{row.timeLabel}</Text>
          </View>
          {row.cells.map((slot, dayIdx) => (
            <View
              key={DAY_NAMES[dayIdx]}
              style={[styles.slotCell, slot ? styles.slotCellFilled : styles.slotCellEmpty]}
            >
              {slot && (
                <>
                  <Text style={styles.slotThematic}>
                    {slot.slotTemplate?.thematic ?? ''}
                  </Text>
                  {slot.slotTemplate?.location && (
                    <Text style={styles.slotLocation}>
                      {getLabel(SLOT_LOCATION, slot.slotTemplate.location)}
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

export default function CalendarPages({ upcomingSlots }: { upcomingSlots: Slot[] }) {
  const weeks = groupSlotsByWeek(upcomingSlots)
  const pages: WeekData[][] = []
  let currentPage: WeekData[] = []
  let currentHeight = 0

  for (const week of weeks) {
    const weekHeight = estimateWeekHeight(week)
    if (currentPage.length > 0 && currentHeight + weekHeight > AVAILABLE_HEIGHT) {
      pages.push(currentPage)
      currentPage = [week]
      currentHeight = weekHeight
    } else {
      currentPage.push(week)
      currentHeight += weekHeight
    }
  }
  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  if (pages.length === 0) {
    return (
      <Page size="A4" style={styles.calendarPage}>
        <Text style={styles.emptyMessage}>Aucun rendez-vous à venir.</Text>
      </Page>
    )
  }

  return (
    <>
      {pages.map((pageWeeks) => (
        <Page key={pageWeeks[0]?.weekLabel} size="A4" style={styles.calendarPage}>
          {pageWeeks.map((weekData) => (
            <WeekBlock key={weekData.weekLabel} weekData={weekData} />
          ))}
        </Page>
      ))}
    </>
  )
}
