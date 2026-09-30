import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { ShieldAlert } from 'lucide-react'

import { Etiquette } from '../components/table/etiquette.tsx'
import { ACCESS_LOG_ACTION_LABELS } from '../constants/accessLog.constant.ts'
import type { PatientAccessLogEntry } from '../types/accessLog.ts'

const columnHelper = createColumnHelper<PatientAccessLogEntry>()

type AccessLogColumnOptions = {
  // Résout `serviceId` en nom lisible — sur cette route, TOUJOURS le service courant
  // (`findByPatientInService` filtre par `tenantContext.scope()`, back), mais la colonne lit la
  // ligne elle-même plutôt que de supposer cette contrainte côté front.
  services: { id: string; name: string }[]
}

// CE QUE CET ECRAN MONTRE.
//
// `patientAccessLogEntryResponseSchema` (back) rend l'auteur (`userFirstName`/`userLastName`),
// l'action, la date (`createdAt`), le service (`serviceId`) et `accesParOctroi` — une colonne par
// champ ci-dessous, plus une pour ce dernier.
//
// HISTORIQUE DE CETTE COLONNE : elle n'était pas affichée à l'origine, parce
// qu'aucune des trois lectures du journal ne la rendait alors (un défaut du cahier des charges
// initial, pas un choix délibéré). Le back l'expose désormais
// dans ses trois schémas de réponse (`patientAccessLog.schema.ts`,
// `superAdminAccessLog.schema.ts`) ; ce fichier l'affiche à son tour.
//
// LA COLONNE NE SE FOND PAS DANS LE RESTE, À DESSEIN : un accès de dépannage (octroi temporaire
// de super-admin) est l'ANOMALIE que ce journal existe pour laisser sauter aux yeux — pas une
// propriété de plus, à égalité visuelle avec la date ou le service. Elle se rend donc en deux
// temps, jamais comme une colonne booléenne banale (« Oui »/« Non » sur chaque ligne, qui noierait
// l'anomalie dans le bruit d'un « Non » répété) :
//   - un accès RÉEL (`accesParOctroi: false`, l'immense majorité des lignes) : rien, la cellule
//     reste vide, exactement comme `followedElsewhere` (`front/CLAUDE.md`) ne rend rien sur
//     `false`/`undefined` plutôt que d'afficher une négation partout ;
//   - un accès PAR OCTROI (`accesParOctroi: true`) : un badge ambré, avec icône, qui NOMME la
//     provenance (« Accès par octroi ») plutôt que de se contenter d'un point de couleur —
//     l'anomalie doit se lire, pas seulement se remarquer.
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
    cell: (info) =>
      ACCESS_LOG_ACTION_LABELS[info.getValue()] ?? info.getValue(),
    size: 240,
  }),
  columnHelper.accessor(
    (row) =>
      services.find((service) => service.id === row.serviceId)?.name ??
      row.serviceId,
    {
      id: 'service',
      header: 'Service',
      size: 160,
    },
  ),
  columnHelper.accessor('accesParOctroi', {
    id: 'accesParOctroi',
    header: 'Origine',
    size: 180,
    cell: (info) => {
      if (!info.getValue()) {
        return null
      }
      return (
        <Etiquette ton="alerte">
          <ShieldAlert className="w-3 h-3" />
          Accès par octroi
        </Etiquette>
      )
    },
  }),
]
