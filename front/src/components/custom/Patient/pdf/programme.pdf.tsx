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
    padding: 40,
    fontFamily: 'Helvetica',
    position: 'relative',
    height: '100%',
  },
  coverLogo: {
    position: 'absolute',
    top: 40,
    left: 40,
    width: 160,
    height: 'auto',
  },
  coverContent: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    color: '#0f766e',
  },
  coverSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 40,
  },
  coverPatientName: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  coverPatientInfo: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  coverDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 60,
  },
  lines: {
    position: 'absolute',
    height: 'auto',
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
})

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
  pastSlots: Slot[]
}

function CoverPage({ patient }: { patient: Patient }) {
  const age = patient.birthDate
    ? dayjs().diff(dayjs(patient.birthDate), 'year')
    : null

  return (
    <Page size="A4" style={styles.coverPage}>
      <Image src={logoCHU} style={styles.coverLogo} />

      <View>
        <Image src={lines} style={[styles.lines, { top: -10, right: -10 }]} />
        <Image src={lines} style={styles.lines} />
        <Image src={lines} style={styles.lines} />
      </View>

      <View style={styles.coverContent}>
        <Text style={styles.coverTitle}>Programme Patient</Text>
        <Text style={styles.coverSubtitle}>MediSync - Suivi personnalisé</Text>

        <View style={{ marginTop: 40 }}>
          <Text style={styles.coverPatientName}>
            {patient.firstName} {patient.lastName}
          </Text>
          <Text style={styles.coverPatientInfo}>
            {getLabel(GENDER, patient.gender)}
            {age ? `, ${age} ans` : ''}
          </Text>
          {patient.programType && (
            <Text style={styles.coverPatientInfo}>
              Programme : {getLabel(PROGRAM_TYPE, patient.programType)}
            </Text>
          )}
        </View>

        <Text style={styles.coverDate}>
          Document généré le {dayjs().format('DD MMMM YYYY')}
        </Text>
      </View>
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

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pastSlots,
}: ProgrammePDFProps) {
  return (
    <Document>
      <CoverPage patient={patient} />
      <PatientInfoPage patient={patient} />
      <AppointmentsPage
        patient={patient}
        title="Rendez-vous à venir"
        slots={upcomingSlots}
        pageNumber={3}
      />
      <AppointmentsPage
        patient={patient}
        title="Rendez-vous passés"
        slots={pastSlots}
        pageNumber={4}
      />
    </Document>
  )
}
