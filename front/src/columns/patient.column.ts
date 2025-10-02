import { createColumnHelper } from '@tanstack/react-table'
import type { Patient } from '../types/patient.ts'
import dayjs from 'dayjs'

const columnHelper = createColumnHelper<Patient>()

export const getPatientColumns = () => {
  return [
    columnHelper.accessor('firstName', {
      header: 'Prénom',
    }),
    columnHelper.accessor('lastName', {
      header: 'Nom',
    }),
    columnHelper.accessor((row) => dayjs(row.entryDate).format('DD/MM/YYYY'), {
      id: 'entryDate',
      header: "Date d'entrée",
    }),
  ]
}
