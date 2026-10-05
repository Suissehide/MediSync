import { useMutation } from '@tanstack/react-query'

import { AuthApi } from '../../api/auth.api.ts'
import { ServiceMembersApi } from '../../api/serviceMembers.api.ts'
import { SERVICE_ROLE_LABEL } from '../../constants/member.constant.ts'
import { useDataFetching } from '../../hooks/useDataFetching.ts'
import { useAuthStore } from '../../store/useAuthStore.ts'
import type { ServiceRole } from '../../types/auth.ts'
import { SoignantDuServiceSelect } from './soignantDuServiceSelect.tsx'

type Affectation = {
  establishmentId: string
  establishmentName: string
  serviceId: string
  serviceName: string
  role: ServiceRole
  soignantId: string | null
}

function SoignantDuService({ affectation }: { affectation: Affectation }) {
  const update = useAuthStore((state) => state.update)
  const { establishmentId, serviceId } = affectation
  const choisir = useMutation({
    mutationFn: async (soignantId: string | null) => {
      await ServiceMembersApi.setOwnSoignant({
        establishmentId,
        serviceId,
        soignantId,
      })
      return AuthApi.me()
    },
    onSuccess: update,
  })
  useDataFetching({
    isPending: choisir.isPending,
    isError: choisir.isError,
    error: choisir.error,
  })

  return (
    <SoignantDuServiceSelect
      establishmentId={establishmentId}
      serviceId={serviceId}
      value={affectation.soignantId}
      onChange={(soignantId) => choisir.mutate(soignantId)}
      disabled={choisir.isPending}
      label={`${affectation.establishmentName} > ${affectation.serviceName} - ${SERVICE_ROLE_LABEL[affectation.role]}`}
    />
  )
}

// Le soignant (métier du service) que le compte incarne dans chacun de ses services.
export function MesSoignants() {
  const user = useAuthStore((state) => state.user)
  const affectations: Affectation[] = (user?.establishments ?? []).flatMap(
    (e) =>
      e.services
        .filter((s) => s.affecte)
        .map((s) => ({
          establishmentId: e.id,
          establishmentName: e.name,
          serviceId: s.id,
          serviceName: s.name,
          role: s.role,
          soignantId: s.soignantId ?? null,
        })),
  )
  if (affectations.length === 0) {
    return null
  }
  return (
    <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 gap-4">
      {affectations.map((a) => (
        <SoignantDuService key={a.serviceId} affectation={a} />
      ))}
    </div>
  )
}
