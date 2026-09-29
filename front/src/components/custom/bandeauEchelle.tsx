import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  Globe,
  KeyRound,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  PopoverClose,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { AUTH } from '@/constants/process.constant.ts'
import { useCurrentScale } from '@/navigation/navigation.ts'
import { useSuperAdminRevokeGrant } from '@/queries/useSuperAdmin.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useLastGrantStore } from '@/store/useLastGrantStore.ts'
import { administeredEstablishments } from '@/utils/tenant-context.ts'

// Bandeau d'echelle (navigation multi-tenant, option 2a) : sous la barre, il dit qu'on n'est
// pas dans le travail ordinaire d'un service — administration d'un etablissement, plateforme,
// ou service atteint par un accès temporaire (octroi super-admin). Absent sur un service
// ordinaire. Lu sur la ROUTE, comme les onglets.

export type Bandeau =
  | { kind: 'establishment'; establishmentId: string }
  | { kind: 'platform' }
  | { kind: 'octroi'; establishmentId: string }

export const useBandeauEchelle = (): Bandeau | null => {
  const courant = useCurrentScale()
  const user = useAuthStore((state) => state.user)
  if (courant?.scale === 'establishment') {
    return { kind: 'establishment', establishmentId: courant.establishmentId }
  }
  if (courant?.scale === 'platform') {
    return { kind: 'platform' }
  }
  if (
    courant?.scale === 'service' &&
    user?.establishments.find((e) => e.id === courant.establishmentId)
      ?.origine === 'octroi'
  ) {
    return { kind: 'octroi', establishmentId: courant.establishmentId }
  }
  return null
}

const BOUTON =
  'h-[26px] px-2.5 flex items-center gap-1.5 rounded bg-white/18 text-[13px] font-semibold text-white hover:bg-white/25 cursor-pointer'

export const BandeauEchelle = ({ bandeau }: { bandeau: Bandeau }) => {
  const user = useAuthStore((state) => state.user)
  const nomDe = (id: string) =>
    user?.establishments.find((e) => e.id === id)?.name ?? 'Établissement'

  let icone = <Globe className="w-4 h-4 shrink-0" />
  let titre = 'Plateforme'
  let texte: ReactNode = 'Vue super-admin, tous établissements confondus.'
  if (bandeau.kind === 'establishment') {
    const administres = administeredEstablishments(user)
    icone = <ShieldCheck className="w-4 h-4 shrink-0" />
    titre = 'Administration'
    texte =
      administres.length > 1 ? (
        <>
          <EtablissementsAdministres
            courantId={bandeau.establishmentId}
            nom={nomDe(bandeau.establishmentId)}
          />
          ces réglages s'appliquent à tous ses services.
        </>
      ) : (
        `de ${nomDe(bandeau.establishmentId)} : ces réglages s'appliquent à tous ses services.`
      )
  } else if (bandeau.kind === 'octroi') {
    icone = <KeyRound className="w-4 h-4 shrink-0" />
    titre = 'Accès temporaire'
    texte = `à ${nomDe(bandeau.establishmentId)} : chaque consultation est tracée (Origine : octroi).`
  }

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-40 h-9 px-4 flex items-center justify-between gap-3 text-sm text-white ${
        bandeau.kind === 'establishment' ? 'bg-primary' : 'bg-secondary-dark'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icone}
        <strong className="font-semibold">{titre}</strong>
        <span className="flex items-center gap-2 truncate">{texte}</span>
      </div>
      {bandeau.kind === 'octroi' && (
        <RevoquerOctroi establishmentId={bandeau.establishmentId} />
      )}
    </div>
  )
}

const EtablissementsAdministres = ({
  courantId,
  nom,
}: {
  courantId: string
  nom: string
}) => {
  const user = useAuthStore((state) => state.user)
  return (
    <PopoverRoot>
      <PopoverTrigger className={BOUTON}>
        {nom}
        <ChevronDown className="w-4 h-4" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[280px] p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-light">
          Établissements administrés
        </p>
        {administeredEstablishments(user).map((etablissement) => {
          const estCourant = etablissement.id === courantId
          return (
            <PopoverClose asChild key={etablissement.id}>
              <Link
                to="/e/$establishmentId/admin/members"
                params={{ establishmentId: etablissement.id }}
                aria-current={estCourant ? 'true' : undefined}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-primary/10 focus-visible:bg-primary/10 ${
                  estCourant
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-text-dark'
                }`}
              >
                <span className="truncate">{etablissement.name}</span>
                {etablissement.origine === 'octroi' && (
                  <span className="px-1.5 py-px rounded bg-secondary-light text-[11px] font-semibold text-secondary-dark">
                    Temporaire
                  </span>
                )}
                {estCourant && <Check className="ml-auto w-4 h-4 shrink-0" />}
              </Link>
            </PopoverClose>
          )
        })}
      </PopoverContent>
    </PopoverRoot>
  )
}

// Meme invariant qu'`ActiveGrantNotice` : `/me` ne rend pas l'identifiant de l'octroi, on ne
// peut revoquer que celui cree dans CETTE session. Sinon, on le dit : l'absence du bouton ne
// doit jamais se lire comme « aucun accès actif ».
const RevoquerOctroi = ({ establishmentId }: { establishmentId: string }) => {
  const grantId = useLastGrantStore(
    (state) => state.grantIdByEstablishment[establishmentId],
  )
  const revoke = useSuperAdminRevokeGrant()
  const queryClient = useQueryClient()
  const router = useRouter()

  if (!grantId) {
    return (
      <span className="shrink-0 text-xs text-white/80">
        révocation indisponible depuis cette session
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`${BOUTON} shrink-0`}
      disabled={revoke.isPending}
      onClick={() =>
        revoke.mutate(grantId, {
          // L'appartenance disparait de `/me` : on jette la copie en cache (`ensureQueryData` la
          // resservirait meme perimee), puis l'index choisit ou atterrir.
          onSuccess: () => {
            queryClient.removeQueries({ queryKey: [AUTH.ME] })
            void router.navigate({ to: '/' })
          },
        })
      }
    >
      <X className="w-4 h-4" />
      Révoquer l'accès
    </button>
  )
}
