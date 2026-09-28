import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getSuperAdminAccessLogColumns } from '@/columns/superAdminAccessLog.column.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ReactTable } from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import {
  SANS_ETABLISSEMENT,
  SUPER_ADMIN_ACCESS_LOG_SOURCE_OPTIONS,
  superAdminAccessLogActionOptions,
} from '@/constants/superAdminAccessLog.constant.ts'
import { useSuperAdminAccessLogQuery } from '@/queries/useSuperAdminAccessLog.ts'
import { useSuperAdminEstablishmentsQuery } from '@/queries/useSuperAdmin.ts'
import type { SuperAdminAccessLogEntry, SuperAdminAccessLogSource } from '@/types/superAdminAccessLog.ts'

// Étape 4b, tâche 11 : l'écran plateforme du super-admin, dernier des deux journaux — `GET
// /super-admin/access-log` (back, tâche 6). Écran hors de tout tenant, comme ses voisins : voir
// `../super-admin.tsx`, le layout parent qui pose la SEULE garde (`isSuperAdmin`, `notFound()`
// jamais une redirection). Ce fichier ne redéclare rien ici, exactement comme `index.tsx` et
// `users.tsx` — un compte sans le drapeau ne voit jamais ce composant : `beforeLoad` du parent
// lève avant que ce fichier ne soit atteint.
export const Route = createFileRoute('/_authenticated/super-admin/access-log')({
  component: SuperAdminAccessLogPage,
})

type Filtres = {
  source: SuperAdminAccessLogSource
  establishmentId: string
  action: string
  compte: string
}

// Délai avant d'envoyer la saisie du champ « Compte » au serveur — voir son usage plus bas.
const DELAI_SAISIE_MS = 300

const FILTRES_PAR_DEFAUT: Filtres = {
  // Le journal des CONSULTATIONS par défaut : c'est celui où `accesParOctroi` distingue
  // l'anomalie qu'un super-admin cherche en premier sur cet écran (voir
  // `columns/superAdminAccessLog.column.tsx`).
  source: 'acces',
  establishmentId: '',
  action: '',
  compte: '',
}

function SuperAdminAccessLogPage() {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_PAR_DEFAUT)

  // LE FILTRE « COMPTE » EST DIFFÉRÉ AVANT D'ÊTRE ENVOYÉ. Il est devenu un filtre SERVEUR (voir
  // juste en dessous) : sans ce délai, chaque frappe déclencherait une lecture de toute la table
  // du journal, avec un `ILIKE` sur deux colonnes, à l'échelle de la plateforme. Le dépôt n'a pas
  // de crochet de temporisation ; son précédent pour une recherche texte côté serveur est un
  // bouton d'envoi explicite (`addPatientForm.tsx`, `usePatientIdentitySearch`). Un bouton pour
  // un seul champ au milieu d'un bandeau de sélecteurs se lirait mal ici, d'où ce délai — court,
  // local, et sans dépendance nouvelle.
  const [compteApplique, setCompteApplique] = useState('')
  useEffect(() => {
    const minuteur = setTimeout(() => setCompteApplique(filtres.compte.trim()), DELAI_SAISIE_MS)
    return () => clearTimeout(minuteur)
  }, [filtres.compte])

  const { establishments } = useSuperAdminEstablishmentsQuery()
  // LES TROIS FILTRES SONT SERVEUR (revue finale de branche, Important n°1). Le filtre « compte »
  // était appliqué DANS LE NAVIGATEUR, sur la page déjà tronquée à 200 lignes (`createdAt desc`,
  // `PLATFORM_ACCESS_LOG_LIMIT`, les deux dépôts) : chercher un compte rendait « aucune entrée »
  // alors que ses lignes existaient, plus bas dans la table. Un filtre navigateur ne peut, par
  // construction, que réduire une page déjà tronquée. Le filtre serveur, lui, existait — mais
  // n'acceptait qu'un `userID` EXACT, que personne ne tape de mémoire, et n'était donc appelé par
  // personne. Il accepte désormais les deux formes que cette saisie peut produire (identifiant
  // exact ou fragment de prénom/nom), et c'est LUI qui est branché ici.
  const { entries, isPending, error } = useSuperAdminAccessLogQuery({
    source: filtres.source,
    establishmentId: filtres.establishmentId || undefined,
    compte: compteApplique || undefined,
    action: filtres.action || undefined,
  })

  const rows = entries ?? []

  const hasActiveFilters = Boolean(
    filtres.establishmentId || filtres.action || filtres.compte,
  )

  const set = <K extends keyof Filtres>(key: K) => (value: Filtres[K]) =>
    setFiltres((prev) => ({ ...prev, [key]: value }))

  const changerSource = (value: string) => {
    const source = (value || 'acces') as SuperAdminAccessLogSource
    // Changer de journal réinitialise `action` : les deux journaux ne partagent pas le même
    // vocabulaire d'action (voir `constants/superAdminAccessLog.constant.ts`) — garder l'ancienne
    // valeur filtrerait sur une action qui n'existe pas dans l'autre journal.
    //
    // ET RÉINITIALISE « Sans établissement » (revue finale de branche) : cette valeur n'existe
    // que sur le journal d'activité, et la garder en basculant sur les consultations enverrait
    // au back une requête qu'il refuse par un 400 (`PatientAccessLog.establishmentId` est non
    // nullable — voir le `.refine` du schéma). L'écran ne doit jamais pouvoir formuler cette
    // demande-là ; un vrai identifiant d'établissement, lui, reste valable sur les deux journaux
    // et n'est donc pas réinitialisé.
    setFiltres((prev) => ({
      ...prev,
      source,
      action: '',
      establishmentId:
        prev.establishmentId === SANS_ETABLISSEMENT && source !== 'activite'
          ? ''
          : prev.establishmentId,
    }))
  }

  // « Sans établissement » n'est proposée que sur le journal d'activité : c'est le seul des deux
  // modèles dont `establishmentId` puisse être nul (les lignes du script d'amorçage). Sur les
  // consultations, l'option n'existe pas plutôt que d'exister et d'échouer.
  const establishmentOptions = [
    ...(filtres.source === 'activite'
      ? [{ value: SANS_ETABLISSEMENT, label: "Sans établissement (amorçage)" }]
      : []),
    ...(establishments ?? []).map((e) => ({
      value: e.id,
      label: e.name,
    })),
  ]

  const columns = getSuperAdminAccessLogColumns({
    source: filtres.source,
    establishments: establishments ?? [],
  })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Journaux
        </h1>

        <div className="w-64">
          <Label htmlFor="super-admin-access-log-source">Journal</Label>
          <Select
            id="super-admin-access-log-source"
            value={filtres.source}
            onValueChange={changerSource}
            options={SUPER_ADMIN_ACCESS_LOG_SOURCE_OPTIONS}
            clearable={false}
          />
        </div>

        {/* Trois états distincts (front/CLAUDE.md, § Testing) : une erreur de chargement rendait
        deux fois un tableau vide indiscernable d'une panne réelle sur ce dépôt — l'erreur
        s'affiche donc à part, avant même d'atteindre `ReactTable`, qui garde la distinction
        chargement/vide qu'il tient déjà correctement pour ces deux-là (`isLoading`/`emptyState`,
        même composition que `super-admin/index.tsx`). */}
        {error ? (
          <p className="text-sm text-destructive">
            Impossible de charger le journal de la plateforme. Réessayez plus tard.
          </p>
        ) : (
          <ReactTable<SuperAdminAccessLogEntry>
            data={rows}
            columns={columns}
            filterId="super-admin-access-log"
            isLoading={isPending}
            emptyState={
              <div className="py-8 text-center text-text-light text-sm">
                Aucune entrée trouvée
              </div>
            }
            customHeader={() => (
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <div>
                  <Label htmlFor="super-admin-access-log-compte">Compte</Label>
                  <Input
                    id="super-admin-access-log-compte"
                    placeholder="Nom ou identifiant..."
                    value={filtres.compte}
                    onChange={(e) => set('compte')(e.target.value)}
                    iconLeft={<Search className="h-4 w-4" />}
                    className="w-56"
                  />
                </div>
                <div className="w-60">
                  <Label htmlFor="super-admin-access-log-establishment">Établissement</Label>
                  <Select
                    id="super-admin-access-log-establishment"
                    value={filtres.establishmentId}
                    onValueChange={(v) => set('establishmentId')(v ?? '')}
                    options={establishmentOptions}
                    placeholder="Tous les établissements"
                    clearable
                  />
                </div>
                <div className="w-60">
                  <Label htmlFor="super-admin-access-log-action">Action</Label>
                  <Select
                    id="super-admin-access-log-action"
                    value={filtres.action}
                    onValueChange={(v) => set('action')(v ?? '')}
                    options={superAdminAccessLogActionOptions(filtres.source)}
                    placeholder="Toutes les actions"
                    clearable
                  />
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFiltres(FILTRES_PAR_DEFAUT)}
                    className="text-text-light"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default SuperAdminAccessLogPage
