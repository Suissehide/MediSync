import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { Patient } from '../../../../../types/patient.ts'
import type { Slot } from '../../../../../types/slot.ts'

const styles = StyleSheet.create({
  testPage: {
    padding: 36,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: '#221755',
  },
})

interface TestPageProps {
  patient: Patient
  upcomingSlots: Slot[]
}

export default function TestPage(_props: TestPageProps) {
  return (
    <Page size="A4" style={styles.testPage}>
      <View>
        <Text style={styles.title}>Page Test</Text>
      </View>
    </Page>
  )
}
