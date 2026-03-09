import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import dayjs from 'dayjs'

import lines from '../../../../assets/images/pdf/lines.png'
import logoCHU from '../../../../assets/images/pdf/logo_chx-bdx.png'
import {
  CARE_MODE,
  GENDER,
  MEDICAL_DIAGNOSIS,
  PROGRAM_TYPE,
} from '../../../../constants/patient.constant.ts'
import { SLOT_LOCATION } from '../../../../constants/slot.constant.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1f2937',
  },
  coverPage: {
    padding: 0,
    fontFamily: 'Helvetica',
    position: 'relative',
    backgroundColor: '#ffffff',
    width: '100%',
    height: '100%',
  },
  coverLogo: {
    position: 'absolute',
    top: 36,
    left: 36,
    width: 140,
    height: 'auto',
  },
  linesTopRight: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 200,
    height: 'auto',
    transform: 'rotate(180deg)',
  },
  linesBottomRight: {
    position: 'absolute',
    bottom: 80,
    right: -20,
    width: 160,
    height: 'auto',
  },
  purpleCircle: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#9333ea',
  },
  coverCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverMainTitle: {
    fontSize: 72,
    fontFamily: 'Helvetica-Bold',
    color: '#e05a5a',
    textAlign: 'center',
  },
  coverTitleUnderline: {
    height: 4,
    width: 120,
    backgroundColor: '#e05a5a',
    marginTop: 4,
    marginBottom: 16,
  },
  coverSubtitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#7c3aed',
    textAlign: 'center',
    marginBottom: 24,
  },
  coverDuration: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    textAlign: 'center',
  },
  coverDateRange: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    textAlign: 'center',
  },
  coverPatientName: {
    position: 'absolute',
    bottom: 48,
    left: 36,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
  },
  header: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0f766e',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0f766e',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    width: 140,
    color: '#6b7280',
    fontSize: 10,
  },
  value: {
    flex: 1,
    fontSize: 10,
  },
  appointmentCard: {
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#0f766e',
  },
  appointmentTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  appointmentDetails: {
    fontSize: 10,
    color: '#6b7280',
  },
  appointmentDate: {
    fontSize: 10,
    color: '#374151',
    marginTop: 4,
  },
  emptyMessage: {
    fontSize: 10,
    color: '#9ca3af',
    fontStyle: 'italic',
    padding: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#9ca3af',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 40,
    fontSize: 9,
    color: '#9ca3af',
  },
  calendarPage: {
    padding: 28,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#1f2937',
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

type WeekData = {
  weekLabel: string
  weekStart: dayjs.Dayjs
  timeRows: {
    timeLabel: string
    cells: (Slot | null)[] // index 0=lundi..4=vendredi
  }[]
}

function computeProgramDuration(slots: Slot[]): {
  weeks: number
  startDate: dayjs.Dayjs
  endDate: dayjs.Dayjs
} | null {
  if (slots.length === 0) return null
  const dates = slots.map((s) => dayjs(s.startDate))
  const startDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b))
  const endDate = dates.reduce((a, b) => (a.isAfter(b) ? a : b))
  const weeks = endDate.startOf('isoWeek').diff(startDate.startOf('isoWeek'), 'week') + 1
  return { weeks, startDate, endDate }
}

function groupSlotsByWeek(slots: Slot[]): WeekData[] {
  if (slots.length === 0) return []

  const sorted = [...slots].sort((a, b) =>
    dayjs(a.startDate).diff(dayjs(b.startDate)),
  )

  const programStart = dayjs(sorted[0].startDate).startOf('isoWeek')
  const programEnd = dayjs(sorted[sorted.length - 1].startDate).startOf(
    'isoWeek',
  )

  const result: WeekData[] = []
  let current = programStart
  let weekIndex = 1

  while (current.isBefore(programEnd) || current.isSame(programEnd, 'day')) {
    const weekSlots = slots.filter((s) => {
      const d = dayjs(s.startDate)
      return (
        (d.isAfter(current) || d.isSame(current, 'day')) &&
        d.isBefore(current.add(7, 'day'))
      )
    })

    const weekdaySlots = weekSlots.filter((s) => {
      const dow = dayjs(s.startDate).day()
      return dow !== 0 && dow !== 6
    })
    const timeKeys = Array.from(
      new Set(
        weekdaySlots.map((s) =>
          `${dayjs(s.startDate).format('HH:mm')}-${dayjs(s.endDate).format('HH:mm')}`,
        ),
      ),
    ).sort()

    const timeRows = timeKeys.map((timeKey) => {
      const [start, end] = timeKey.split('-')
      const cells: (Slot | null)[] = Array.from({ length: 5 }, (_, i) => {
        const day = current.add(i, 'day')
        return (
          weekdaySlots.find(
            (s) =>
              dayjs(s.startDate).isSame(day, 'day') &&
              dayjs(s.startDate).format('HH:mm') === start &&
              dayjs(s.endDate).format('HH:mm') === end,
          ) ?? null
        )
      })
      return { timeLabel: timeKey.replace('-', '\n'), cells }
    })

    if (timeRows.length === 0) {
      timeRows.push({
        timeLabel: '',
        cells: [null, null, null, null, null],
      })
    }

    result.push({
      weekLabel: `Semaine ${weekIndex}`,
      weekStart: current,
      timeRows,
    })

    current = current.add(7, 'day')
    weekIndex++
  }

  return result
}

function getLabel<T extends Record<string, string>>(
  obj: T,
  key: string | undefined,
): string {
  if (!key) {
    return 'Non spécifié'
  }
  return obj[key as keyof T] ?? key
}

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
}

const DAY_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

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

      {weekData.timeRows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.timeRow}>
          <View style={styles.timeLabelCell}>
            <Text style={styles.timeLabelText}>{row.timeLabel}</Text>
          </View>
          {row.cells.map((slot, dayIdx) => (
            <View
              key={dayIdx}
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

function CalendarPages({ upcomingSlots }: { upcomingSlots: Slot[] }) {
  const weeks = groupSlotsByWeek(upcomingSlots)
  const pages: WeekData[][] = []
  for (let i = 0; i < weeks.length; i += 3) {
    pages.push(weeks.slice(i, i + 3))
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
      {pages.map((pageWeeks, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.calendarPage}>
          {pageWeeks.map((weekData, i) => (
            <WeekBlock key={i} weekData={weekData} />
          ))}
        </Page>
      ))}
    </>
  )
}

function CoverPage({ patient, upcomingSlots }: { patient: Patient; upcomingSlots: Slot[] }) {
  const duration = computeProgramDuration(upcomingSlots)
  const genderPrefix = patient.gender === 'female' ? 'Mme' : patient.gender === 'male' ? 'M.' : ''
  const patientLabel = `${genderPrefix} ${patient.lastName}`.trim()
  const programLabel = patient.programType
    ? getLabel(PROGRAM_TYPE, patient.programType)
    : 'Programme'

  return (
    <Page size="A4" style={styles.coverPage}>
      <Image src={logoCHU} style={styles.coverLogo} />
      <Image src={lines} style={styles.linesTopRight} />
      <Image src={lines} style={styles.linesBottomRight} />
      <View style={styles.purpleCircle} />

      <View style={styles.coverCenter}>
        <Text style={styles.coverMainTitle}>SMCV</Text>
        <View style={styles.coverTitleUnderline} />
        <Text style={styles.coverSubtitle}>{programLabel}</Text>
        {duration && (
          <>
            <Text style={styles.coverDuration}>{duration.weeks} semaines</Text>
            <Text style={styles.coverDateRange}>
              Du {duration.startDate.format('DD/MM')} au{' '}
              {duration.endDate.format('DD/MM/YYYY')}
            </Text>
          </>
        )}
      </View>

      <Text style={styles.coverPatientName}>{patientLabel}</Text>
    </Page>
  )
}

function PatientInfoPage({ patient }: { patient: Patient }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Informations Patient</Text>
        <Text style={styles.headerSubtitle}>
          {patient.firstName} {patient.lastName}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identité</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Nom complet</Text>
          <Text style={styles.value}>
            {patient.firstName} {patient.lastName}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Genre</Text>
          <Text style={styles.value}>{getLabel(GENDER, patient.gender)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date de naissance</Text>
          <Text style={styles.value}>
            {patient.birthDate
              ? dayjs(patient.birthDate).format('DD/MM/YYYY')
              : 'Non spécifié'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{patient.email || 'Non spécifié'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Téléphone 1</Text>
          <Text style={styles.value}>{patient.phone1 || 'Non spécifié'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Téléphone 2</Text>
          <Text style={styles.value}>{patient.phone2 || 'Non spécifié'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations médicales</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Diagnostic médical</Text>
          <Text style={styles.value}>
            {getLabel(MEDICAL_DIAGNOSIS, patient.medicalDiagnosis)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Mode de prise en charge</Text>
          <Text style={styles.value}>
            {getLabel(CARE_MODE, patient.careMode)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Type de programme</Text>
          <Text style={styles.value}>
            {getLabel(PROGRAM_TYPE, patient.programType)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date d'entrée</Text>
          <Text style={styles.value}>
            {patient.entryDate
              ? dayjs(patient.entryDate).format('DD/MM/YYYY')
              : 'Non spécifié'}
          </Text>
        </View>
        {patient.goal && (
          <View style={styles.row}>
            <Text style={styles.label}>Objectif</Text>
            <Text style={styles.value}>{patient.goal}</Text>
          </View>
        )}
      </View>

      <Text style={styles.pageNumber}>2</Text>
    </Page>
  )
}

function AppointmentCard({ slot }: { slot: Slot }) {
  const thematic = slot.slotTemplate?.thematic || 'Rendez-vous'
  const location = slot.slotTemplate?.location
  const soignant = slot.slotTemplate?.soignant?.name

  const formattedDate = dayjs(slot.startDate)
    .format('dddd D MMMM YYYY')
    .replace(/^./, (c) => c.toUpperCase())
  const startTime = dayjs(slot.startDate).format('HH:mm')
  const endTime = dayjs(slot.endDate).format('HH:mm')

  return (
    <View style={styles.appointmentCard}>
      <Text style={styles.appointmentTitle}>{thematic}</Text>
      {soignant && (
        <Text style={styles.appointmentDetails}>Intervenant : {soignant}</Text>
      )}
      {location && (
        <Text style={styles.appointmentDetails}>
          Lieu : {getLabel(SLOT_LOCATION, location)}
        </Text>
      )}
      <Text style={styles.appointmentDate}>
        {formattedDate} de {startTime} à {endTime}
      </Text>
    </View>
  )
}

function AppointmentsPage({
  patient,
  title,
  slots,
  pageNumber,
}: {
  patient: Patient
  title: string
  slots: Slot[]
  pageNumber: number
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>
          {patient.firstName} {patient.lastName} - {slots.length} rendez-vous
        </Text>
      </View>

      {slots.length > 0 ? (
        slots.map((slot) => <AppointmentCard key={slot.id} slot={slot} />)
      ) : (
        <Text style={styles.emptyMessage}>Aucun rendez-vous</Text>
      )}

      <Text style={styles.pageNumber}>{pageNumber}</Text>
    </Page>
  )
}

export default function ProgrammePDF({ patient, upcomingSlots }: ProgrammePDFProps) {
  return (
    <Document>
      <CoverPage patient={patient} upcomingSlots={upcomingSlots} />
      <CalendarPages upcomingSlots={upcomingSlots} />
    </Document>
  )
}
