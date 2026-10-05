import { SERVICE_ROLE_LABEL } from '../../constants/member.constant.ts'
import type { ServiceRole, User } from '../../types/auth.ts'
import { SoignantDuServiceSelect } from './soignantDuServiceSelect.tsx'

export type Affectation = {
  establishmentId: string
  establishmentName: string
  serviceId: string
  serviceName: string
  role: ServiceRole
  soignantId: string | null
}

// Les vraies affectations du compte (ni coordinateur implicite, ni octroi).
export const affectationsDe = (user: User | null | undefined): Affectation[] =>
  (user?.establishments ?? []).flatMap((e) =>
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

// Le soignant (métier du service) que le compte incarne dans chacun de ses services.
export function MesSoignants({
  affectations,
  value,
  onChange,
}: {
  affectations: Affectation[]
  value: Record<string, string | null>
  onChange: (serviceId: string, soignantId: string | null) => void
}) {
  if (affectations.length === 0) {
    return null
  }
  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      {affectations.map((a) => (
        <SoignantDuServiceSelect
          key={a.serviceId}
          establishmentId={a.establishmentId}
          serviceId={a.serviceId}
          value={value[a.serviceId] ?? null}
          onChange={(soignantId) => onChange(a.serviceId, soignantId)}
          label={`${a.establishmentName} > ${a.serviceName} - ${SERVICE_ROLE_LABEL[a.role]}`}
        />
      ))}
    </div>
  )
}
