// Vocabulaire de la présence, pour toute l'application : « Vu » / « Non venu », sans accord à
// deviner (le genre du patient est souvent vide) et sans « absent », qui se lit comme un reproche.
const PRESENCE: Record<
  string,
  { pastille: string; texte: string; label: string }
> = {
  yes: { pastille: 'bg-[#16a34a]', texte: 'text-[#15803d]', label: 'Vu' },
  no: { pastille: 'bg-[#dc2626]', texte: 'text-[#b91c1c]', label: 'Non venu' },
}

const NON_RENSEIGNE = {
  pastille: 'border-2 border-text-sidebar',
  texte: 'text-text-light',
  label: 'Non renseigné',
}

const etatDe = (status?: string | null) =>
  PRESENCE[status ?? ''] ?? NON_RENSEIGNE

export function PastillePresence({ status }: { status?: string | null }) {
  const { pastille, label } = etatDe(status)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`size-2.5 shrink-0 rounded-full ${pastille}`}
    />
  )
}

// La même présence, pastille ET libellé. `aVenir` remplace le libellé par « À venir » : sur un
// rendez-vous qui n'a pas eu lieu, « Non renseigné » annoncerait un oubli de saisie.
export function StatutPresence({
  status,
  aVenir,
}: {
  status?: string | null
  aVenir?: boolean
}) {
  const { pastille, texte, label } = aVenir ? NON_RENSEIGNE : etatDe(status)
  return (
    <span
      className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${texte}`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${pastille}`}
      />
      {aVenir ? 'À venir' : label}
    </span>
  )
}
