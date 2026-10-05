import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { AuthApi } from '../../api/auth.api.ts'
import { ServiceMembersApi } from '../../api/serviceMembers.api.ts'
import { SoignantApi } from '../../api/soignant.api.ts'
import { apiUrl } from '../../constants/config.constant.ts'
import { SERVICE_ROLE_LABEL } from '../../constants/member.constant.ts'
import { SOIGNANT } from '../../constants/process.constant.ts'
import { useDataFetching } from '../../hooks/useDataFetching.ts'
import { useAuthStore } from '../../store/useAuthStore.ts'
import type { ServiceRole } from '../../types/auth.ts'
import { Label } from '../ui/label.tsx'
import { Select } from '../ui/select.tsx'

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
  const { data: soignants } = useQuery({
    queryKey: [SOIGNANT.GET_ALL_OF_SERVICE, establishmentId, serviceId],
    queryFn: () =>
      SoignantApi.getAll(`${apiUrl}/e/${establishmentId}/s/${serviceId}`),
  })
  const options = useMemo(
    () =>
      (soignants ?? [])
        .filter((s) => s.active || s.id === affectation.soignantId)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants, affectation.soignantId],
  )
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

  const id = `soignant-${serviceId}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {affectation.establishmentName} · {affectation.serviceName}
        <span className="ml-2 font-normal text-text-light">
          {SERVICE_ROLE_LABEL[affectation.role]}
        </span>
      </Label>
      <Select
        id={id}
        options={options}
        value={affectation.soignantId ?? ''}
        placeholder="Aucun soignant"
        disabled={choisir.isPending}
        onValueChange={(value) => choisir.mutate(value || null)}
      />
    </div>
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
