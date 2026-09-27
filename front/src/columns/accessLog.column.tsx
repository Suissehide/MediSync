import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { ACCESS_LOG_ACTION_LABELS } from '../constants/accessLog.constant.ts'
import type { PatientAccessLogEntry } from '../types/accessLog.ts'

const columnHelper = createColumnHelper<PatientAccessLogEntry>()

type AccessLogColumnOptions = {
  // Résout `serviceId` en nom lisible — sur cette route, TOUJOURS le service courant
  // (`findByPatientInService` filtre par `tenantContext.scope()`, back), mais la colonne lit la
  // ligne elle-même plutôt que de supposer cette contrainte côté front.
  services: { id: string; name: string }[]
}

// Etape 4b, tache 10 : CE QUE CET ECRAN MONTRE, ET CE QU'IL NE MONTRE PAS.
//
// `patientAccessLogEntryResponseSchema` (back) rend exactement quatre champs utiles : l'auteur
// (`userFirstName`/`userLastName`), l'action, la date (`createdAt`) et le service (`serviceId`) —
// une seule colonne par champ ci-dessous.
//
// CE QUI CONTREDIT LE CAHIER DES CHARGES DE CETTE TACHE, ET POURQUOI IL N'Y A PAS DE COLONNE
// `accesParOctroi` ICI : le brief demande de distinguer un accès obtenu par octroi temporaire de
// super-admin. Mais AUCUNE des trois lectures du journal (service, établissement, plateforme) ne
// rend jamais cette colonne — voir le commentaire de `patientAccessLogEntryResponseSchema`
// (back/.../schemas/patientAccessLog.schema.ts : « jamais patientId, exportCount, exportFilters
// ni accesParOctroi, meme si le depot les rend ») et celui, identique dans l'esprit, de
// `superAdminAccessLogEntryResponseSchema`. C'est un choix délibéré et répété du back (tâches 5
// et 6 de cette étape), pas un oubli : le filtrage vient du mode « strip » par défaut de Zod, pas
// d'une liste noire écrite à la main. Le front ne peut pas afficher une donnée que la route ne
// sert jamais — une colonne ici serait soit vide en permanence, soit une invention. Signalé au
// rapport de tâche plutôt que suivi en silence.
export const getAccessLogColumns = ({ services }: AccessLogColumnOptions) => [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => dayjs.utc(info.getValue()).format('DD/MM/YYYY'),
    size: 110,
  }),
  columnHelper.accessor((row) => dayjs.utc(row.createdAt).format('HH:mm'), {
    id: 'time',
    header: 'Heure',
    size: 80,
  }),
  columnHelper.accessor(
    (row) =>
      row.userFirstName || row.userLastName
        ? `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim()
        : '—',
    {
      id: 'author',
      header: 'Auteur',
      size: 200,
    },
  ),
  columnHelper.accessor('action', {
    header: 'Action',
    cell: (info) => ACCESS_LOG_ACTION_LABELS[info.getValue()] ?? info.getValue(),
    size: 240,
  }),
  columnHelper.accessor(
    (row) => services.find((service) => service.id === row.serviceId)?.name ?? row.serviceId,
    {
      id: 'service',
      header: 'Service',
      size: 160,
    },
  ),
]
