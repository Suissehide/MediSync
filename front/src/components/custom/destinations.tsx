import { useRouter } from '@tanstack/react-router'

import type { Destination } from '@/utils/tenant-context.ts'

// Presentation commune des destinations d'un compte (`accessibleDestinations`), partagee par le
// selecteur d'echelle et la page `/choose-context` : meme regroupement, memes intitules, memes
// icones, meme cible. Les deux ecrans listent la MEME chose ; s'ils la presentaient chacun a sa
// facon (administration a part, « Super-administration » d'un cote et « Plateforme » de
// l'autre), on croirait a deux listes differentes.

// `id` : l'etablissement (ou `null` pour la plateforme). Deux etablissements peuvent porter le
// meme nom ; le regroupement et la cle React se font donc sur l'identifiant, jamais sur le titre.
// `administration` : l'administration de l'etablissement quand le compte l'administre. Elle n'est
// pas une ligne de plus sous les services : c'est le TITRE de l'etablissement, cliquable, qui y
// mene (`TitreEtablissement`).
export type GroupeDeDestinations = {
  id: string | null
  titre: string | null
  administration: Destination | null
  destinations: Destination[]
}

export const grouperDestinations = (
  destinations: Destination[],
): GroupeDeDestinations[] => {
  const groupes: GroupeDeDestinations[] = []
  for (const destination of destinations) {
    const id =
      destination.kind === 'platform' ? null : destination.establishment.id
    const titre =
      destination.kind === 'platform' ? null : destination.establishment.name
    let groupe = groupes.at(-1)
    if (!groupe || groupe.id !== id) {
      groupe = { id, titre, administration: null, destinations: [] }
      groupes.push(groupe)
    }
    if (destination.kind === 'admin') {
      groupe.administration = destination
    } else {
      groupe.destinations.push(destination)
    }
  }
  return groupes
}

export const cleDestination = (destination: Destination): string => {
  switch (destination.kind) {
    case 'service':
      return `${destination.establishment.id}/${destination.service.id}`
    case 'admin':
      return `${destination.establishment.id}/admin`
    default:
      return 'plateforme'
  }
}

export const intituleDestination = (destination: Destination): string => {
  switch (destination.kind) {
    case 'service':
      return destination.service.name
    case 'admin':
      return "Administration de l'établissement"
    default:
      return 'Plateforme'
  }
}

// Toujours l'ecran d'entree de l'echelle : une fiche patient precise n'a pas d'equivalent
// dans un autre service.
export const useOuvrirDestination = () => {
  const router = useRouter()
  return (destination: Destination) => {
    if (destination.kind === 'service') {
      void router.navigate({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: {
          establishmentId: destination.establishment.id,
          serviceId: destination.service.id,
        },
      })
    } else if (destination.kind === 'admin') {
      void router.navigate({
        to: '/e/$establishmentId/admin',
        params: { establishmentId: destination.establishment.id },
      })
    } else {
      void router.navigate({ to: '/super-admin' })
    }
  }
}
