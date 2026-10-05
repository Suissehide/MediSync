import { createFileRoute, Link } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import RenameEstablishmentForm from '@/components/custom/popup/renameEstablishmentForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useMembersQuery } from '@/queries/useMembers.ts'
import {
  useRenameEstablishment,
  useServicesQuery,
} from '@/queries/useServices.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'

// Écran d'entrée de l'échelle établissement : ce qu'on vient voir en cliquant
// sur le nom de l'établissement. Le renommage vivait dans l'onglet Services,
// où rien ne le désignait.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/',
)({
  component: ResumeEtablissement,
})

function ResumeEtablissement() {
  const { establishmentId } = Route.useParams()
  const establishment = useAuthStore((state) =>
    state.user?.establishments.find((e) => e.id === establishmentId),
  )
  const renameEstablishment = useRenameEstablishment()
  const [renommer, setRenommer] = useState(false)
  const { services } = useServicesQuery()
  const { members } = useMembersQuery()

  const actifs = services?.filter((s) => s.deactivatedAt === null).length
  const administrateurs = members?.filter((m) => m.role === 'ADMIN').length

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex items-center gap-2">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            {establishment?.name ?? 'Établissement'}
          </h1>
          {establishment && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRenommer(true)}
              title="Renommer l'établissement"
              aria-label="Renommer l'établissement"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>

        <RenameEstablishmentForm
          establishment={renommer && establishment ? establishment : null}
          onClose={() => setRenommer(false)}
          rename={renameEstablishment}
        />

        <div className="flex flex-wrap gap-4">
          <Compteur
            titre="Services"
            valeur={services?.length}
            detail={actifs === undefined ? null : `${actifs} actif(s)`}
            to="/e/$establishmentId/admin/services"
            establishmentId={establishmentId}
          />
          <Compteur
            titre="Membres"
            valeur={members?.length}
            detail={
              administrateurs === undefined
                ? null
                : `${administrateurs} administrateur(s)`
            }
            to="/e/$establishmentId/admin/members"
            establishmentId={establishmentId}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

const Compteur = ({
  titre,
  valeur,
  detail,
  to,
  establishmentId,
}: {
  titre: string
  valeur: number | undefined
  detail: string | null
  to: '/e/$establishmentId/admin/services' | '/e/$establishmentId/admin/members'
  establishmentId: string
}) => (
  <Link
    to={to}
    params={{ establishmentId }}
    className="w-48 rounded-lg border border-border p-4 hover:bg-primary/5"
  >
    <p className="text-sm font-semibold uppercase text-text-light">{titre}</p>
    <p className="text-2xl font-semibold text-text-dark">{valeur ?? '—'}</p>
    <p className="text-sm text-text-light">{detail ?? ' '}</p>
  </Link>
)
