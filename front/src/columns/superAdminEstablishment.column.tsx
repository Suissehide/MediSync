import { useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'

import { CopyableId } from '../components/custom/copyableId.tsx'
import { useOuvrirDestination } from '../components/custom/destinations.tsx'
import CreateGrantForm from '../components/custom/popup/createGrantForm.tsx'
import { Button } from '../components/ui/button.tsx'
import { meQueryOptions } from '../queries/useMe.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import type { EstablishmentListItem } from '../types/superAdmin.ts'
import { accessibleDestinations } from '../utils/tenant-context.ts'

const columnHelper = createColumnHelper<EstablishmentListItem>()

const StatutBadge = ({ deactivatedAt }: { deactivatedAt: string | null }) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium whitespace-nowrap ${
      deactivatedAt !== null
        ? 'bg-gray-100 text-gray-600 border border-gray-200'
        : 'bg-green-50 text-green-700 border border-green-200'
    }`}
  >
    {deactivatedAt !== null ? 'Désactivé' : 'Actif'}
  </span>
)

// Colonnes de la liste des établissements (spec §3.3, task-12-brief.md,
// step 1) : une par clé exacte de `establishmentListItemSchema` (voir
// `back/src/main/interfaces/http/fastify/schemas/establishment.schema.ts`),
// plus l'identifiant copiable exigé par le brief.
export const superAdminEstablishmentColumns = [
  columnHelper.display({
    id: 'id',
    header: 'Identifiant',
    size: 220,
    cell: ({ row }) => <CopyableId value={row.original.id} />,
  }),
  columnHelper.accessor('name', {
    header: 'Établissement',
  }),
  columnHelper.display({
    id: 'acces',
    header: 'Votre accès',
    cell: ({ row }) => <AccesCell establishmentId={row.original.id} />,
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => (
      <StatutBadge deactivatedAt={row.original.deactivatedAt} />
    ),
  }),
  columnHelper.accessor('serviceCount', {
    header: 'Services',
  }),
  columnHelper.accessor('accountCount', {
    header: 'Comptes',
  }),
  columnHelper.accessor('patientCount', {
    header: 'Patients',
  }),
  columnHelper.display({
    id: 'firstAdmin',
    header: 'Premier administrateur',
    cell: ({ row }) => {
      const admin = row.original.firstAdmin
      if (!admin) {
        return <span className="text-text-light">—</span>
      }
      const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ')
      return name ? `${name} (${admin.email})` : admin.email
    },
  }),
  columnHelper.accessor('createdAt', {
    header: 'Créé le',
    cell: (info) => dayjs.utc(info.getValue()).format('DD/MM/YYYY'),
  }),
  columnHelper.accessor('lastActivityAt', {
    header: 'Dernière activité',
    cell: (info) => {
      const value = info.getValue()
      return value ? dayjs.utc(value).format('DD/MM/YYYY HH:mm') : '—'
    },
  }),
  columnHelper.display({
    id: 'action',
    header: '',
    size: 220,
    cell: ({ row }) => <ActionCell establishmentId={row.original.id} />,
  }),
]

// Navigation multi-tenant (2026-09-29) : ce que le super-admin a DEJA dans cet etablissement, et
// de quoi y entrer. Lu sur `/me` (le store), jamais sur la ligne : la liste ne dit rien du compte.
const AccesCell = ({ establishmentId }: { establishmentId: string }) => {
  const appartenance = useAuthStore((state) =>
    state.user?.establishments.find((e) => e.id === establishmentId),
  )
  if (!appartenance) {
    return <span className="text-text-light">—</span>
  }
  if (appartenance.origine === 'octroi') {
    return (
      <span className="px-1.5 py-px rounded bg-secondary-light text-xs font-semibold text-secondary-dark whitespace-nowrap">
        Accès temporaire
      </span>
    )
  }
  return appartenance.role === 'ADMIN' ? 'Membre · Admin' : 'Membre'
}

const ActionCell = ({ establishmentId }: { establishmentId: string }) => {
  const membre = useAuthStore((state) =>
    state.user?.establishments.some((e) => e.id === establishmentId),
  )
  const ouvrirDestination = useOuvrirDestination()
  const queryClient = useQueryClient()
  // Relit `/me` avant d'entrer : juste apres un octroi, l'appartenance n'y est pas encore.
  const ouvrir = async () => {
    const user = await queryClient.fetchQuery({
      ...meQueryOptions,
      staleTime: 0,
    })
    useAuthStore.getState().update(user)
    const cible = accessibleDestinations(user).find(
      (d) => d.kind !== 'platform' && d.establishment.id === establishmentId,
    )
    if (cible) {
      ouvrirDestination(cible)
    }
  }
  return (
    // La ligne ouvre la fiche au clic : l'action ne doit pas la declencher aussi (les clics du
    // formulaire d'octroi, rendu en portail, remontent eux aussi par l'arbre React).
    // biome-ignore lint/a11y/noStaticElementInteractions: simple barriere de propagation
    // biome-ignore lint/a11y/useKeyWithClickEvents: idem
    <div onClick={(e) => e.stopPropagation()}>
      {membre ? (
        <Button variant="outline" size="sm" onClick={() => void ouvrir()}>
          Ouvrir
        </Button>
      ) : (
        <CreateGrantForm
          establishmentId={establishmentId}
          onGranted={() => void ouvrir()}
          trigger={
            <Button variant="default" size="sm">
              Ouvrir un accès temporaire
            </Button>
          }
        />
      )}
    </div>
  )
}
