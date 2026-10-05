import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChevronRight, Globe, ShieldCheck } from 'lucide-react'

import {
  cleDestination,
  grouperDestinations,
  intituleDestination,
  useOuvrirDestination,
} from '@/components/custom/destinations.tsx'
import { useLogout } from '@/queries/useAuth.ts'
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

const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

// Page de repli, hors echelle : meme regroupement et memes intitules que le selecteur
// d'echelle (`destinations.tsx`), mis en page comme un panneau d'orientation d'hopital.
function ChooseContext() {
  const user = useAuthStore((state) => state.user)
  const { logoutMutation } = useLogout()
  const ouvrir = useOuvrirDestination()
  const groupes = grouperDestinations(accessibleDestinations(user))

  // Un bouton, pas un `Link` : le survol ne doit pas laisser croire a un prechargement.
  const ligne = (destination: Destination) => (
    <li key={cleDestination(destination)}>
      <button
        type="button"
        onClick={() => ouvrir(destination)}
        className={`group flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left text-[15px] text-foreground cursor-pointer transition-colors hover:bg-primary/5 ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
      >
        <span>{intituleDestination(destination)}</span>
        <ChevronRight className="w-4 h-4 shrink-0 text-text-light transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>
    </li>
  )

  return (
    <div className="min-h-screen w-full bg-background px-4 py-6 sm:px-8">
      <p className="text-2xl font-bold">
        <span className="text-primary">Medi</span>Sync
      </p>

      <main className="mx-auto mt-10 grid max-w-5xl gap-10 md:mt-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
        <div className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            Où travaillez-vous aujourd'hui&nbsp;?
          </h1>
          <p className="text-base text-muted-foreground">
            Choisissez l'espace à ouvrir. Vous pourrez en changer à tout moment
            en haut de l'écran.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-text-light">
            <span>Connecté en tant que {user?.email}</span>
            <button
              type="button"
              onClick={() => logoutMutation()}
              className={`rounded-sm font-medium text-primary underline-offset-4 cursor-pointer hover:underline ${FOCUS}`}
            >
              Se déconnecter
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {groupes.map((groupe) => {
            if (groupe.titre === null) {
              return groupe.destinations.map((destination) => (
                <button
                  key={cleDestination(destination)}
                  type="button"
                  onClick={() => ouvrir(destination)}
                  className={`group flex items-center gap-3 rounded-md bg-secondary-dark px-5 py-4 text-left text-lg font-semibold text-white cursor-pointer transition-[filter] hover:brightness-110 ${FOCUS}`}
                >
                  <Globe className="w-5 h-5 shrink-0" />
                  <span className="flex-1">
                    {intituleDestination(destination)}
                  </span>
                  <ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))
            }
            const { administration } = groupe
            return (
              <section
                key={groupe.id}
                aria-label={groupe.titre}
                className="overflow-hidden rounded-md border border-border bg-background"
              >
                <h2 className="bg-primary-dark text-lg font-semibold text-white">
                  {administration ? (
                    <button
                      type="button"
                      onClick={() => ouvrir(administration)}
                      aria-label={`${groupe.titre} — administration de l'établissement`}
                      className={`group flex w-full items-center gap-4 px-5 py-4 text-left cursor-pointer transition-colors hover:bg-white/10 ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
                    >
                      <span className="flex-1 truncate">{groupe.titre}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-sm font-normal text-white/80 group-hover:text-white">
                        <ShieldCheck className="w-4 h-4" />
                        Administration
                      </span>
                    </button>
                  ) : (
                    <span className="block truncate px-5 py-4">
                      {groupe.titre}
                    </span>
                  )}
                </h2>
                {groupe.destinations.length > 0 && (
                  <ul className="divide-y divide-border">
                    {groupe.destinations.map(ligne)}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}
