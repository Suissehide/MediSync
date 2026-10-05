import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo } from 'react'

import { SoignantApi } from '../../api/soignant.api.ts'
import { apiUrl } from '../../constants/config.constant.ts'
import { SOIGNANT } from '../../constants/process.constant.ts'
import { Label } from '../ui/label.tsx'
import { Select } from '../ui/select.tsx'

// Les soignants d'un service DONNÉ, pour les écrans sans service courant (établissement, profil).
export function SoignantDuServiceSelect({
  establishmentId,
  serviceId,
  value,
  onChange,
  label = 'Soignant',
  disabled,
}: {
  establishmentId: string
  serviceId: string
  value: string | null
  onChange: (soignantId: string | null) => void
  label?: ReactNode
  disabled?: boolean
}) {
  const { data: soignants } = useQuery({
    queryKey: [SOIGNANT.GET_ALL_OF_SERVICE, establishmentId, serviceId],
    queryFn: () =>
      SoignantApi.getAll(`${apiUrl}/e/${establishmentId}/s/${serviceId}`),
  })
  const options = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )
  const id = `soignant-${serviceId}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        options={options}
        value={value ?? ''}
        placeholder="Aucun soignant"
        disabled={disabled}
        onValueChange={(next) => onChange(next || null)}
      />
    </div>
  )
}
