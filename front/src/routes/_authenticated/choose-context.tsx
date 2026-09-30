import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  cleDestination,
  grouperDestinations,
  iconeDestination,
  intituleDestination,
  LibelleServices,
  TitreEtablissement,
  useOuvrirDestination,
} from '@/components/custom/destinations.tsx'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Destination } from '@/utils/tenant-context.ts'
import { accessibleDestinations } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/choose-context')({
  // Sans aucun couple ni aucune administration accessible, cette page n'a
  // rien a proposer : direction /pending, l'ecran d'attente d'approbation ou
  // d'affectation.
  beforeLoad: ({ context }) => {
    const { user } = context.authState
    // Meme derivation que le selecteur d'echelle : un super-admin sans aucune appartenance a
    // encore une destination, la plateforme.
    if (accessibleDestinations(user).length === 0) {
      throw redirect({ to: '/pending' })
    }
  },
  component: ChooseContext,
})

// Page de repli, hors echelle (ni onglets ni panneau lateral) : l'application y envoie quand
// elle ne sait pas ou mettre le compte — connexion avec plusieurs acces, URL devenue invalide
// (service retire, droit perdu), ancienne URL sans equivalent. Elle presente les destinations
// EXACTEMENT comme le selecteur d'echelle (`destinations.tsx`) : l'etablissement en titre
// (cliquable vers son administration pour qui l'administre), ses services decales dessous, la
// plateforme a part.
function ChooseContext() {
  const user = useAuthStore((state) => state.user)
  const ouvrir = useOuvrirDestination()
  const groupes = grouperDestinations(accessibleDestinations(user))

  // Un bouton, pas un `Link` : le survol ne doit pas laisser croire a un prechargement de
  // destination sur cet ecran de choix.
  const entree = (destination: Destination, avecIcone: boolean) => (
    <button
      key={cleDestination(destination)}
      type="button"
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-text-dark transition-colors cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10 outline-none"
      onClick={() => ouvrir(destination)}
    >
      {avecIcone && (
        <span className="shrink-0 opacity-70">
          {iconeDestination(destination)}
        </span>
      )}
      <span>{intituleDestination(destination)}</span>
    </button>
  )

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-dark">
            Choisir un accès
          </h1>
          <p className="text-text-light">
            Choisissez le service ou l'espace que vous voulez ouvrir.
          </p>
        </div>

        <div className="flex flex-col rounded-lg border border-border bg-card p-2">
          {groupes.map((groupe, index) =>
            groupe.titre === null ? (
              <div
                key="plateforme"
                className={
                  index > 0 ? 'mt-1 border-t border-border pt-1' : undefined
                }
              >
                {groupe.destinations.map((destination) =>
                  entree(destination, true),
                )}
              </div>
            ) : (
              <div key={groupe.id} className="flex flex-col">
                <TitreEtablissement
                  titre={groupe.titre}
                  onOuvrir={
                    groupe.administration
                      ? () =>
                          groupe.administration && ouvrir(groupe.administration)
                      : undefined
                  }
                />
                {groupe.destinations.length > 0 && (
                  <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5">
                    <LibelleServices />
                    {groupe.destinations.map((destination) =>
                      entree(destination, false),
                    )}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
