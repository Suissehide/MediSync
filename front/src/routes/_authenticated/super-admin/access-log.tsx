import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getSuperAdminAccessLogColumns } from '@/columns/superAdminAccessLog.column.tsx'
import { SuperAdminNav } from '@/components/custom/superAdmin/superAdminNav.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ReactTable } from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import {
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

  const { establishments } = useSuperAdminEstablishmentsQuery()
  const { entries, isPending, error } = useSuperAdminAccessLogQuery({
    source: filtres.source,
    establishmentId: filtres.establishmentId || undefined,
    action: filtres.action || undefined,
  })

  // Le filtre « compte » est client, comme celui d'`activity-log.tsx` (recherche sur le nom ou
  // l'identifiant) : la route back ne connaît qu'un `userID` exact, que personne ne tape de
  // mémoire sur un écran de diagnostic plateforme.
  const rows = useMemo(() => {
    const toutes = entries ?? []
    if (!filtres.compte) {
      return toutes
    }
    const recherche = filtres.compte.toLowerCase()
    return toutes.filter((row) => {
      const nomComplet = `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.toLowerCase()
      return nomComplet.includes(recherche) || row.userID.toLowerCase().includes(recherche)
    })
  }, [entries, filtres.compte])

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
    setFiltres((prev) => ({ ...prev, source, action: '' }))
  }

  const establishmentOptions = (establishments ?? []).map((e) => ({
    value: e.id,
    label: e.name,
  }))

  const columns = getSuperAdminAccessLogColumns({
    source: filtres.source,
    establishments: establishments ?? [],
  })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Journal des accès
        </h1>
        <SuperAdminNav />

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
                    placeholder="Rechercher un compte..."
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
