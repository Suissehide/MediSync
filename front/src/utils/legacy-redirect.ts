import { redirect } from '@tanstack/react-router'

import type { User } from '@/types/auth.ts'
import { administeredEstablishments, defaultTenantContext } from '@/utils/tenant-context.ts'

// Les anciennes URLs ne portent aucun service. On applique la regle du
// contexte par defaut, jamais une devinette.
export const redirectToDefaultService = (user: User | null, to: string, extra?: Record<string, string>): never => {
  const tenant = defaultTenantContext(user)
  if (!tenant || tenant.serviceId === null) {
    throw redirect({ to: '/pending' })
  }
  throw redirect({
    to,
    params: {
      establishmentId: tenant.establishmentId,
      serviceId: tenant.serviceId,
      ...extra,
    },
    // `search: true` reprend tels quels les parametres de recherche de
    // l'URL entrante (voir la resolution dans `buildLocation` du routeur) :
    // un favori du type `/agenda?date=...` ne doit pas perdre `date`.
    search: true,
  })
}

// Navigation par echelle (2026-09-28) : Soignants, Salles et le journal d'activite ont quitte
// l'echelle du service pour celle de l'etablissement. Leurs anciennes URLs (sans service, ou
// sous un service) menent a l'administration du premier etablissement administre — le seul
// endroit ou ces ecrans existent encore. Sans etablissement administre, le choix d'acces, qui
// dira ce qui reste ouvert au compte.
export const redirectToDefaultAdmin = (user: User | null, to: string): never => {
  const [administered] = administeredEstablishments(user)
  if (!administered) {
    throw redirect({ to: '/choose-context' })
  }
  throw redirect({ to, params: { establishmentId: administered.id }, search: true })
}
