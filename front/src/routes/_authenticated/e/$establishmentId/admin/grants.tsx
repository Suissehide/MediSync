import { createFileRoute, redirect } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo } from 'react'

import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Etiquette } from '@/components/table/etiquette.tsx'
import { can } from '@/hooks/useCan.ts'
import { queryState } from '@/libs/queryState.ts'
import { useEstablishmentGrantsQuery } from '@/queries/useGrants.ts'
import type { EstablishmentGrant } from '@/types/grant.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// `GET /e/:establishmentId/admin/grants` (back, `grants.ts`) : DÉLIBÉRÉMENT
// asymétrique avec le super-admin (task-13-brief.md, arbitrage transmis par
// Léo) — l'établissement voit qui dispose d'un accès chez lui, le
// super-admin ne dispose pas de la liste des siens.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/grants',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'members:manage')) {
      throw redirect({ to: '/' })
    }
  },
  component: GrantsAdmin,
})

const grantedByLabel = (grant: EstablishmentGrant) =>
  [grant.grantedBy.firstName, grant.grantedBy.lastName]
    .filter(Boolean)
    .join(' ') || grant.grantedBy.email

// « En cours » : ni révoqué, ni expiré. Tout le reste est « passé » — un
// octroi révoqué AVANT son expiration reste distinct d'un octroi simplement
// expiré (voir le statut affiché), mais les deux sont du passé.
const estEnCours = (grant: EstablishmentGrant, maintenant: Date) =>
  grant.revokedAt === null && new Date(grant.expiresAt) > maintenant

const statutPasse = (grant: EstablishmentGrant, maintenant: Date) => {
  if (grant.revokedAt !== null) {
    return (
      <Etiquette ton="danger">
        Révoqué le {dayjs.utc(grant.revokedAt).format('DD/MM/YYYY HH:mm')}
      </Etiquette>
    )
  }
  return new Date(grant.expiresAt) <= maintenant ? (
    <Etiquette ton="neutre">Expiré</Etiquette>
  ) : (
    <Etiquette ton="succes">En cours</Etiquette>
  )
}

function GrantsAdmin() {
  const { grants, isPending, error } = useEstablishmentGrantsQuery()

  const etat = queryState({ isPending, error, hasData: grants !== undefined })

  // Mineur (tour de correction 1, tâche 13) : UNE seule valeur de temps
  // pour tout le rendu — `new Date()` appelé une seconde fois plus bas (au
  // moment d'étiqueter un accès passé) pouvait, à la seconde de bascule,
  // classer un octroi comme « passé » ici puis l'étiqueter « En cours »
  // là-bas, pour le même octroi dans le même rendu.
  const maintenant = useMemo(() => new Date(), [])

  const { enCours, passes } = useMemo(() => {
    const tous = grants ?? []
    return {
      enCours: tous.filter((g) => estEnCours(g, maintenant)),
      passes: tous.filter((g) => !estEnCours(g, maintenant)),
    }
  }, [grants, maintenant])

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <h1 className="text-xl font-semibold text-text-dark">
          Accès temporaires
        </h1>

        {etat === 'pending' && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Chargement...
          </div>
        )}

        {(etat === 'error' || etat === 'empty') && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Impossible de charger les accès temporaires. Réessayez plus tard.
          </div>
        )}

        {etat === 'ready' && (
          <>
            <section>
              <h2 className="text-sm font-semibold text-text-light uppercase mb-2">
                En cours
              </h2>
              {enCours.length === 0 ? (
                <p className="text-sm text-text-light">Aucun accès en cours</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {enCours.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex justify-between border-b border-border py-2 text-sm gap-3"
                    >
                      <div>
                        <div>{grant.reason}</div>
                        <div className="text-text-light">
                          Accordé par {grantedByLabel(grant)} le{' '}
                          {dayjs
                            .utc(grant.grantedAt)
                            .format('DD/MM/YYYY HH:mm')}
                        </div>
                      </div>
                      <div className="text-text-light whitespace-nowrap">
                        Expire le{' '}
                        {dayjs.utc(grant.expiresAt).format('DD/MM/YYYY HH:mm')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold text-text-light uppercase mb-2">
                Passés
              </h2>
              {passes.length === 0 ? (
                <p className="text-sm text-text-light">Aucun accès passé</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {passes.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex justify-between border-b border-border py-2 text-sm gap-3"
                    >
                      <div>
                        <div>{grant.reason}</div>
                        <div className="text-text-light">
                          Accordé par {grantedByLabel(grant)} le{' '}
                          {dayjs
                            .utc(grant.grantedAt)
                            .format('DD/MM/YYYY HH:mm')}
                        </div>
                      </div>
                      <div>{statutPasse(grant, maintenant)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default GrantsAdmin
