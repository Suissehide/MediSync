import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { Slot } from '../../../../../types/slot.ts'
import { groupSlotsByWeek, type WeekData } from '../programme-pdf.utils.ts'

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

function WeekBlock({ weekData }: { weekData: WeekData }) {
  return (
    <View style={styles.weekBlock}>
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

export default function CalendarPages({
  upcomingSlots,
  patientId,
}: {
  upcomingSlots: Slot[]
  patientId?: string
}) {
  const weeks = groupSlotsByWeek(upcomingSlots, patientId)

  if (weeks.length === 0) {
    return (
      <Page size="A4" style={styles.calendarPage}>
        <Text style={styles.emptyMessage}>Aucun rendez-vous à venir.</Text>
      </Page>
    )
  }

  return (
    <Page size="A4" style={styles.calendarPage}>
      {weeks.map((weekData) => (
        <WeekBlock key={weekData.weekLabel} weekData={weekData} />
      ))}
    </Page>
  )
}
