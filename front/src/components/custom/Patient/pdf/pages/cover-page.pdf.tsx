import { Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import lines from '../../../../../assets/images/pdf/lines.png'
import logoCHU from '../../../../../assets/images/pdf/logo_chx-bdx.png'
import type { Patient } from '../../../../../types/patient.ts'
import type { Slot } from '../../../../../types/slot.ts'
import { computeProgramDuration } from '../programme-pdf.utils.ts'

const styles = StyleSheet.create({
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
    top: -160,
    right: -160,
    width: 280,
    height: 'auto',
    transform: 'rotate(45deg)',
  },
  linesBottomRight: {
    position: 'absolute',
    bottom: -160,
    right: 120,
    width: 260,
    height: 'auto',
    transform: 'rotate(220deg)',
  },
  lavenderCircle: {
    position: 'absolute',
    bottom: -180,
    left: -60,
    width: 380,
    height: 380,
    borderRadius: 260,
    backgroundColor: '#e6aff6',
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
    color: '#221755',
    textAlign: 'center',
  },
  coverDateRange: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#221755',
    textAlign: 'center',
  },
  coverPatientName: {
    position: 'absolute',
    bottom: 48,
    left: 36,
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: '#221755',
  },
})

export default function CoverPage({
  patient,
  upcomingSlots,
}: {
  patient: Patient
  upcomingSlots: Slot[]
}) {
  const duration = computeProgramDuration(upcomingSlots)
  const patientLabel = `${patient.firstName} ${patient.lastName}`
  const pathwayNames = Array.from(
    new Set(
      upcomingSlots.map((s) => s.pathway?.template?.name).filter(Boolean),
    ),
  )
  const programLabel =
    pathwayNames.length > 0 ? pathwayNames.join(' / ') : 'Programme'

  return (
    <Page size="A4" style={styles.coverPage}>
      <Image src={logoCHU} style={styles.coverLogo} />
      <Image src={lines} style={styles.linesTopRight} />
      <Image src={lines} style={styles.linesBottomRight} />
      <View style={styles.lavenderCircle} />

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
