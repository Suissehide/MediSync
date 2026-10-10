import { Link, useParams } from '@tanstack/react-router'

import { useCan } from '@/hooks/useCan.ts'

type Segment = 'activite' | 'ars'

const SEGMENTS: {
  id: Segment
  label: string
  to:
    | '/e/$establishmentId/s/$serviceId/activite'
    | '/e/$establishmentId/s/$serviceId/indicateurs-ars'
}[] = [
  {
    id: 'activite',
    label: 'Activité',
    to: '/e/$establishmentId/s/$serviceId/activite',
  },
  {
    id: 'ars',
    label: 'Indicateurs ARS',
    to: '/e/$establishmentId/s/$serviceId/indicateurs-ars',
  },
]

// Bascule « Activité | Indicateurs ARS », en tete des deux ecrans de l'onglet Pilotage
// (handoff §1). N'existe pas pour qui n'a pas `stats:read` : un seul segment n'est pas une
// bascule, c'est un onglet deguise.
export function BasculePilotage({ actif }: { actif: Segment }) {
  const peutArs = useCan('stats:read')
  const { establishmentId, serviceId } = useParams({ strict: false })

  if (!peutArs) {
    return null
  }

  return (
    <nav
      aria-label="Pilotage"
      className="inline-flex h-[30px] items-center gap-0.5 rounded-lg bg-border p-0.5"
    >
      {SEGMENTS.map((segment) => (
        <Link
          key={segment.id}
          to={segment.to}
          params={{ establishmentId, serviceId } as never}
          aria-current={actif === segment.id ? 'page' : undefined}
          className={`h-[26px] px-3 flex items-center rounded-md text-sm font-medium transition-colors ${
            actif === segment.id
              ? 'bg-carte text-text-dark shadow-sm'
              : 'text-text-light hover:text-text-dark'
          }`}
        >
          {segment.label}
        </Link>
      ))}
    </nav>
  )
}
