import { useRouter } from '@tanstack/react-router'
import { Building2, Globe, ShieldCheck } from 'lucide-react'

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

export const iconeDestination = (destination: Destination) => {
  switch (destination.kind) {
    case 'service':
      return <Building2 className="w-4 h-4" />
    case 'admin':
      return <ShieldCheck className="w-4 h-4" />
    default:
      return <Globe className="w-4 h-4" />
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

// L'en-tete d'un etablissement, au-dessus de ses services decales. Pour un compte qui
// l'administre, l'en-tete est lui-meme l'entree de l'administration : un bouton (survol comme
// les autres entrees), mis en avant quand on s'y trouve deja.
export const TitreEtablissement = ({
  titre,
  onOuvrir,
  courant = false,
}: {
  titre: string
  onOuvrir?: () => void
  courant?: boolean
}) => {
  const contenu = (
    <>
      <Building2 className="w-4 h-4 shrink-0 opacity-70" />
      <span className="truncate">{titre}</span>
    </>
  )
  if (!onOuvrir) {
    return (
      <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-sm font-semibold text-text-dark">
        {contenu}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onOuvrir}
      aria-label={`${titre} — administration de l'établissement`}
      aria-current={courant ? 'true' : undefined}
      title="Administration de l'établissement"
      className={`mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-semibold outline-none transition-colors cursor-pointer hover:bg-primary/20 focus-visible:bg-primary/20 ${
        courant ? 'bg-primary/10 text-primary' : 'text-text-dark'
      }`}
    >
      {contenu}
    </button>
  )
}

// Petit intitule au-dessus des services decales : dit en toutes lettres que ce sont LES
// SERVICES de l'etablissement du dessus, ce que le seul decalage laissait deviner.
export const LibelleServices = () => (
  <div className="px-2 pt-0.5 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-light">
    Services
  </div>
)

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
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: destination.establishment.id },
      })
    } else {
      void router.navigate({ to: '/super-admin' })
    }
  }
}
