import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { accessibleCouples, type AccessibleCouple } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/choose-context')({
  // Sans aucun couple accessible, cette page n'a rien a proposer : direction
  // /pending, l'ecran d'attente d'approbation ou d'affectation.
  beforeLoad: ({ context }) => {
    if (accessibleCouples(context.authState.user).length === 0) {
      throw redirect({ to: '/pending' })
    }
  },
  component: ChooseContext,
})

type Group = { establishment: AccessibleCouple['establishment']; couples: AccessibleCouple[] }

// Regroupe les couples par etablissement, dans l'ordre ou ils apparaissent
// dans l'arbre des appartenances.
const groupByEstablishment = (couples: AccessibleCouple[]): Group[] => {
  const groups: Group[] = []
  for (const couple of couples) {
    const group = groups.find((g) => g.establishment.id === couple.establishment.id)
    if (group) {
      group.couples.push(couple)
    } else {
      groups.push({ establishment: couple.establishment, couples: [couple] })
    }
  }
  return groups
}

function ChooseContext() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const groups = groupByEstablishment(accessibleCouples(user))

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-text-dark">Choisir un service</h1>
          <p className="text-text-light">
            Votre compte est rattaché à plusieurs services : choisissez celui que vous voulez
            ouvrir.
          </p>
        </div>

        {groups.map(({ establishment, couples }) => (
          <div key={establishment.id} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-text-light uppercase tracking-wide">
              {establishment.name}
            </h2>
            <div className="flex flex-col gap-2">
              {couples.map(({ service }) => (
                <button
                  key={service.id}
                  type="button"
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-text-dark transition-colors hover:bg-primary/10"
                  onClick={() =>
                    // Une fiche patient precise n'a pas d'equivalent dans un
                    // autre service tant que l'etape 3 n'a pas cree les
                    // sous-dossiers : on ramene donc toujours a l'index du
                    // service, comme dans `TenantSelector`. Un bouton, pas un
                    // `Link` : le survol ne doit pas laisser croire a un
                    // prechargement de destination sur cet ecran de choix.
                    router.navigate({
                      to: '/e/$establishmentId/s/$serviceId/dashboard',
                      params: { establishmentId: establishment.id, serviceId: service.id },
                    })
                  }
                >
                  <Building2 className="w-4 h-4 shrink-0 opacity-70" />
                  <span>{service.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
