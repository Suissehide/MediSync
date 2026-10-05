const PRESENCE: Record<string, { className: string; label: string }> = {
  yes: { className: 'bg-emerald-500', label: 'Venu' },
  no: { className: 'bg-destructive', label: 'Absent' },
}

export function PastillePresence({ status }: { status?: string | null }) {
  const { className, label } = PRESENCE[status ?? ''] ?? {
    className: 'border border-muted-foreground',
    label: 'Présence non renseignée',
  }
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`size-2.5 shrink-0 rounded-full ${className}`}
    />
  )
}
