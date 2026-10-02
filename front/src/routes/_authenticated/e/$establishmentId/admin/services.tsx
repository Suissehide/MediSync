import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { getServiceColumns } from '@/columns/service.column.tsx'
import CreateServiceForm from '@/components/custom/popup/createServiceForm.tsx'
import RenameServiceForm from '@/components/custom/popup/renameServiceForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '@/components/ui/popup.tsx'
import { can } from '@/hooks/useCan.ts'
import { queryState } from '@/libs/queryState.ts'
import {
  useServiceDeactivationImpact,
  useServiceMutations,
  useServicesQuery,
} from '@/queries/useServices.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Service } from '@/types/service.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Même garde que `admin/members.tsx` : le layout `admin` (voir `admin.tsx`)
// exige DÉJÀ le rôle ADMIN — via `resolveEstablishmentContext`
// (`utils/tenant-context.ts`), qui renvoie `null` si `establishment.role !==
// 'ADMIN'` et fait alors rediriger vers `/choose-context` AVANT que cette
// feuille ne soit atteinte (un MEMBER n'y arrive jamais, voir `admin.test.ts`,
// « refuse un membre sans role ADMIN sur cet etablissement »). Cet écran se
// garde donc EN PLUS, explicitement, par `services:manage` : redondant avec
// le rôle aujourd'hui (tout ADMIN a cette permission, voir
// `ESTABLISHMENT_PERMISSIONS`), mais qui reste correct si la matrice des
// habilitations change un jour et dissocie les deux.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/services',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'services:manage')) {
      throw redirect({ to: '/' })
    }
  },
  component: ServicesAdmin,
})

function ServicesAdmin() {
  const { services, isPending, error } = useServicesQuery()
  const { updateService } = useServiceMutations()
  const impact = useServiceDeactivationImpact()

  const [renameTarget, setRenameTarget] = useState<Service | null>(null)
  // Le service dont on s'apprête à évaluer/confirmer la désactivation.
  // Distinct de `renameTarget` : cette popup n'affiche rien tant que
  // `impact.data` n'est pas arrivé (voir plus bas).
  const [deactivateTarget, setDeactivateTarget] = useState<Service | null>(null)

  const etat = queryState({
    isPending,
    error,
    hasData: services !== undefined,
  })

  const handleToggleActive = useCallback(
    (service: Service) => {
      const deactivated = service.deactivatedAt !== null
      if (deactivated) {
        // Réactiver rend tout (décision 3.6, back) : aucun compteur à
        // vérifier avant, contrairement à désactiver.
        updateService.mutate({ id: service.id, deactivated: false })
        return
      }
      // ARBITRAGE TRANSMIS PAR LÉO (task-13-brief.md) : la liste n'affiche
      // AUCUN compteur en ligne — l'impact n'est calculé qu'ICI, à la
      // demande, au moment de désactiver CE service précis.
      impact.reset()
      setDeactivateTarget(service)
      impact.mutate(service.id)
    },
    [impact, updateService],
  )

  const isToggling = useCallback(
    (service: Service) =>
      updateService.isPending && updateService.variables?.id === service.id,
    [updateService],
  )

  const superAdmin = useAuthStore((state) => state.user?.isSuperAdmin === true)
  const columns = useMemo(
    () =>
      getServiceColumns({
        onRename: setRenameTarget,
        onToggleActive: handleToggleActive,
        isToggling,
        avecIdentifiant: superAdmin,
      }),
    [handleToggleActive, isToggling, superAdmin],
  )

  const closeDeactivateDialog = () => {
    setDeactivateTarget(null)
    impact.reset()
  }

  const confirmDeactivate = () => {
    if (!deactivateTarget) {
      return
    }
    updateService.mutate(
      { id: deactivateTarget.id, deactivated: true },
      { onSuccess: () => closeDeactivateDialog() },
    )
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Services
          </h1>
          <CreateServiceForm />
        </div>

        {etat === 'pending' && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Chargement...
          </div>
        )}

        {(etat === 'error' || etat === 'empty') && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Impossible de charger les services. Réessayez plus tard.
          </div>
        )}

        {etat === 'ready' && services && (
          <ReactTable<Service>
            data={services}
            columns={columns}
            filterId="service-admin"
            emptyState={
              <div className="text-sm text-text-light py-6 text-center">
                Aucun service pour le moment.
              </div>
            }
          />
        )}

        <RenameServiceForm
          service={renameTarget}
          onClose={() => setRenameTarget(null)}
        />

        <Popup
          modal={true}
          open={deactivateTarget !== null}
          onOpenChange={(open) => !open && closeDeactivateDialog()}
        >
          <PopupContent>
            <PopupHeader>
              <PopupTitle className="font-bold text-xl">
                Désactiver {deactivateTarget?.name} ?
              </PopupTitle>
            </PopupHeader>
            <PopupBody>
              {impact.isPending && (
                <p className="text-sm text-text-light">Calcul en cours...</p>
              )}
              {impact.isError && (
                <p className="text-sm text-destructive">
                  Impossible de calculer l'impact de cette désactivation.
                </p>
              )}
              {impact.data && (
                <div className="flex flex-col gap-2 text-sm">
                  <p>
                    <span className="text-text-light">
                      Suivis dans ce service :{' '}
                    </span>
                    <strong>{impact.data.suivisIci}</strong>
                  </p>
                  <p>
                    <span className="text-text-light">
                      Deviendront invisibles PARTOUT (suivis dans aucun autre
                      service actif) :{' '}
                    </span>
                    <strong>{impact.data.suivisNullePartAilleurs}</strong>
                  </p>
                  <p className="text-text-light">
                    Leurs dossiers resteront en base mais ne seront plus
                    accessibles.
                  </p>
                </div>
              )}
            </PopupBody>
            <PopupFooter>
              <Button variant="outline" onClick={closeDeactivateDialog}>
                Annuler
              </Button>
              <Button
                variant="default"
                onClick={confirmDeactivate}
                disabled={!impact.data}
                isLoading={updateService.isPending}
              >
                Confirmer la désactivation
              </Button>
            </PopupFooter>
          </PopupContent>
        </Popup>
      </div>
    </DashboardLayout>
  )
}

export default ServicesAdmin
