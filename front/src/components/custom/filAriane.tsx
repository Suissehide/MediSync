import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Globe,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'

import {
  grouperDestinations,
  useOuvrirDestination,
} from '@/components/custom/destinations.tsx'
import {
  PopoverClose,
  PopoverContent,
  PopoverRoot,
  PopoverSeparator,
  PopoverSubGroup,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { SERVICE_ROLE_LABEL } from '@/constants/member.constant.ts'
import { type CurrentScale, useCurrentScale } from '@/navigation/navigation.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import {
  accessibleCouples,
  accessibleDestinations,
  administeredEstablishments,
  serviceDeRetour,
} from '@/utils/tenant-context.ts'

// Fil d'Ariane `Etablissement › Service` (navigation multi-tenant, option 2a, 2026-09-29).
// Remplace `ScaleSelector`, qui melangeait le contexte de travail et les administrations dans un
// seul menu. Ici :
// - le segment ETABLISSEMENT mene a son administration, pour qui l'administre seulement ;
// - le segment SERVICE ouvre le menu des services sur une echelle service, et ramene au dernier
//   service visite partout ailleurs (administration, plateforme, ecrans hors echelle).
// L'administration du service et la plateforme sont des boutons a droite de la barre
// (`navbar.tsx`). Comme l'ancien selecteur, ce composant ne fait que naviguer : le client de
// requetes neuf et la reinitialisation des stores sont armes a l'arrivee sur la route.
//
// Le contexte affiche suit la ROUTE (`useCurrentScale`), pas le store : sur `/user/settings`, le
// store porte encore le dernier service visite, qui n'est pas l'endroit ou l'on se trouve.

const SEGMENT =
  'h-8 px-2 flex items-center gap-1.5 rounded-md whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Affiche = {
  etablissement: User['establishments'][number]
  service: User['establishments'][number]['services'][number] | undefined
}

// L'etablissement et le service que montre le fil : ceux de la route sur une echelle service ;
// sinon le service de retour (dans l'etablissement administre, s'il y en a un) ; a defaut de tout
// service, le premier etablissement administre, sans segment service.
const aAfficher = (
  user: User | null,
  courant: CurrentScale | null,
): Affiche | null => {
  const etablissementDe = (id: string | undefined) =>
    user?.establishments.find((e) => e.id === id)
  if (courant?.scale === 'service') {
    const etablissement = etablissementDe(courant.establishmentId)
    return etablissement
      ? {
          etablissement,
          service: etablissement.services.find(
            (s) => s.id === courant.serviceId,
          ),
        }
      : null
  }
  const retour = serviceDeRetour(
    user,
    courant?.scale === 'establishment' ? courant.establishmentId : undefined,
  )
  const etablissement =
    etablissementDe(
      courant?.scale === 'establishment'
        ? courant.establishmentId
        : retour?.establishmentId,
    ) ?? administeredEstablishments(user)[0]
  if (!etablissement) {
    return null
  }
  return {
    etablissement,
    service: etablissement.services.find((s) => s.id === retour?.serviceId),
  }
}

export const FilAriane = () => {
  const user = useAuthStore((state) => state.user)
  const courant = useCurrentScale()
  const affiche = aAfficher(user, courant)
  if (!affiche) {
    return null
  }
  const { etablissement, service } = affiche
  const surService = courant?.scale === 'service'
  const surEtablissement = courant?.scale === 'establishment'
  const administre = etablissement.role === 'ADMIN'

  const nomEtablissement = (
    <>
      <Building2 className="w-4 h-4 shrink-0" />
      <span className="truncate">{etablissement.name}</span>
      {etablissement.origine === 'octroi' && (
        <span className="px-1.5 py-px rounded bg-secondary-dark text-[11px] text-white">
          temporaire
        </span>
      )}
    </>
  )
  const classeEtablissement = `${SEGMENT} text-sm font-medium ${
    surEtablissement
      ? 'bg-primary text-white'
      : 'text-text-sidebar hover:bg-white/8'
  }`

  return (
    <nav
      aria-label="Fil d'Ariane"
      className="h-9 flex items-center gap-0.5 pl-2 border-l border-border-sidebar min-w-0"
    >
      {administre ? (
        <Link
          to="/e/$establishmentId/admin"
          params={{ establishmentId: etablissement.id }}
          title="Administration de l'établissement"
          aria-current={surEtablissement ? 'page' : undefined}
          className={classeEtablissement}
        >
          {nomEtablissement}
        </Link>
      ) : (
        <span className={`${classeEtablissement} cursor-default`}>
          {nomEtablissement}
        </span>
      )}

      {service && (
        <>
          <ChevronRight
            aria-hidden="true"
            className="w-4 h-4 shrink-0 text-text-light"
          />
          {surService ? (
            <MenuDesServices user={user} courant={courant} nom={service.name} />
          ) : (
            <Link
              to="/e/$establishmentId/s/$serviceId/dashboard"
              params={{
                establishmentId: etablissement.id,
                serviceId: service.id,
              }}
              title="Revenir au service"
              className={`${SEGMENT} text-[15px] font-semibold text-text-sidebar hover:bg-white/8`}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{service.name}</span>
            </Link>
          )}
        </>
      )}
    </nav>
  )
}

// Le menu des services, ancre sous le segment service. Un groupe par etablissement : son
// en-tete mene a l'administration pour qui l'administre, ses services sont decales dessous.
const MenuDesServices = ({
  user,
  courant,
  nom,
}: {
  user: User | null
  courant: CurrentScale | null
  nom: string
}) => {
  const ouvrir = useOuvrirDestination()
  const [recherche, setRecherche] = useState('')
  const total = accessibleCouples(user).length
  const classe = `${SEGMENT} text-[15px] font-semibold text-white`

  // Un seul service et rien d'autre a proposer : pas de menu, le nom seul.
  if (total <= 1 && !user?.isSuperAdmin) {
    return <span className={`${classe} cursor-default`}>{nom}</span>
  }

  const filtre = recherche.trim().toLocaleLowerCase('fr')
  const groupes = grouperDestinations(accessibleDestinations(user))
    .filter((groupe) => groupe.titre !== null)
    .map((groupe) => ({
      ...groupe,
      destinations: groupe.destinations.filter(
        (d) =>
          !filtre ||
          (d.kind === 'service' &&
            `${d.establishment.name} ${d.service.name}`
              .toLocaleLowerCase('fr')
              .includes(filtre)),
      ),
    }))
    .filter((groupe) => groupe.destinations.length > 0)

  return (
    <PopoverRoot onOpenChange={() => setRecherche('')}>
      <PopoverTrigger
        className={`${classe} cursor-pointer hover:bg-white/8 data-[state=open]:bg-white/12`}
        aria-label={`Changer de service (actuellement : ${nom})`}
      >
        <span className="truncate">{nom}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-text-sidebar" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[300px] p-1.5">
        {total >= 4 && (
          <label className="mb-1 h-[34px] px-2 flex items-center gap-2 rounded-md border border-border bg-input text-sm text-text-dark">
            <Search className="w-3.5 h-3.5 shrink-0 text-text-light" />
            <input
              // biome-ignore lint/a11y/noAutofocus: le menu s'ouvre pour chercher
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un service…"
              aria-label="Rechercher un service"
              className="flex-1 min-w-0 bg-transparent outline-none"
            />
          </label>
        )}
        {groupes.length === 0 && (
          <p className="px-2 py-3 text-sm text-text-light">Aucun service</p>
        )}
        {groupes.map((groupe, index) => {
          const etablissement = user?.establishments.find(
            (e) => e.id === groupe.id,
          )
          const administration = groupe.administration
          const entete = (
            <>
              <Building2 className="w-3.5 h-3.5 shrink-0 text-text-light" />
              <span className="truncate text-[13px] font-semibold text-text-dark">
                {groupe.titre}
              </span>
              {etablissement?.origine === 'octroi' ? (
                <span className="ml-auto px-1.5 py-px rounded bg-secondary-light text-[11px] font-semibold text-secondary-dark whitespace-nowrap">
                  Accès temporaire
                </span>
              ) : (
                administration && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-primary">
                    <ShieldCheck className="w-3 h-3" />
                    Administrer
                  </span>
                )
              )}
            </>
          )
          return (
            <div key={groupe.id} className="flex flex-col">
              {index > 0 && <PopoverSeparator />}
              {administration ? (
                <PopoverClose asChild>
                  <button
                    type="button"
                    onClick={() => ouvrir(administration)}
                    title="Administration de l'établissement"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left outline-none cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10"
                  >
                    {entete}
                  </button>
                </PopoverClose>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {entete}
                </div>
              )}
              <PopoverSubGroup className="ml-[22px] mt-1 mb-1">
                {groupe.destinations.map((destination) => {
                  if (destination.kind !== 'service') {
                    return null
                  }
                  const estCourant =
                    courant?.scale === 'service' &&
                    courant.serviceId === destination.service.id
                  return (
                    <PopoverClose asChild key={destination.service.id}>
                      <button
                        type="button"
                        onClick={() => ouvrir(destination)}
                        aria-current={estCourant ? 'true' : undefined}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm outline-none cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10 ${
                          estCourant
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-text-dark'
                        }`}
                      >
                        <span className="truncate">
                          {destination.service.name}
                        </span>
                        <span className="ml-auto text-xs font-normal text-text-light whitespace-nowrap">
                          {SERVICE_ROLE_LABEL[destination.service.role]}
                        </span>
                        {estCourant && (
                          <Check className="w-4 h-4 shrink-0 text-primary" />
                        )}
                      </button>
                    </PopoverClose>
                  )
                })}
              </PopoverSubGroup>
            </div>
          )
        })}
        {user?.isSuperAdmin && (
          <>
            <PopoverSeparator />
            <PopoverClose asChild>
              <Link
                to="/super-admin"
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-text-light outline-none cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10"
              >
                <Globe className="w-3.5 h-3.5" />
                Gérer les établissements (Plateforme)
              </Link>
            </PopoverClose>
          </>
        )}
      </PopoverContent>
    </PopoverRoot>
  )
}
