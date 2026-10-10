import { compter, type Filtre } from '@/components/custom/ars/statut.ts'
import { Carte } from '@/components/custom/pilotage/carte.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import type { ArsIndicator } from '@/types/arsIndicator.ts'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function Bandeau({
  indicateurs,
  filtre,
  onFiltre,
}: {
  indicateurs: ArsIndicator[]
  filtre: Filtre
  onFiltre: (filtre: Filtre) => void
}) {
  const calcule = compter(indicateurs, 'calcule')
  const saisi = compter(indicateurs, 'saisi')
  const restant = compter(indicateurs, 'restant')
  const indisponible = compter(indicateurs, 'indisponible')

  const parts = [
    { statut: 'calcule', n: calcule, couleur: 'bg-termine' },
    { statut: 'saisi', n: saisi, couleur: 'bg-primary' },
    { statut: 'restant', n: restant, couleur: 'bg-a-saisir' },
    { statut: 'indisponible', n: indisponible, couleur: 'bg-autres-sortis' },
  ]
  const filtres: { id: Filtre; label: string; n: number; couleur: string }[] = [
    {
      id: 'tous',
      label: 'Tous',
      n: indicateurs.length,
      couleur: 'bg-sortis',
    },
    { id: 'calcule', label: 'Calculés', n: calcule, couleur: 'bg-termine' },
    {
      id: 'aSaisir',
      label: 'À saisir',
      n: saisi + restant,
      couleur: 'bg-a-saisir',
    },
    {
      id: 'indisponible',
      label: 'Non disponibles',
      n: indisponible,
      couleur: 'bg-autres-sortis',
    },
  ]

  return (
    <Carte className="py-4 flex-row flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-2 flex-1 min-w-[280px]">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-semibold text-foreground">
            Prêt pour l'enquête
          </span>
          <span className="text-sm text-muted-foreground">
            {`${calcule} calculés · ${saisi + restant} à saisir (${restant ? pluriel(restant, 'restant') : 'complets'}) · ${indisponible} non disponibles`}
          </span>
        </p>
        <div
          aria-hidden
          className="flex h-2 rounded-full overflow-hidden bg-muted"
        >
          {parts.map((p) => (
            <span
              key={p.statut}
              data-statut={p.statut}
              className={p.couleur}
              style={{ flexGrow: p.n }}
            />
          ))}
        </div>
      </div>
      <ToggleGroup
        aria-label="Filtrer les indicateurs"
        value={filtre}
        onValueChange={(v) => v && onFiltre(v as Filtre)}
        className="bg-muted border-0 rounded-lg gap-1"
      >
        {filtres.map((f) => (
          <ToggleGroupItem
            key={f.id}
            value={f.id}
            className="h-[30px] gap-2 text-[13px] whitespace-nowrap text-muted-foreground data-[state=on]:bg-carte data-[state=on]:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm"
          >
            <span aria-hidden className={`size-2 rounded-full ${f.couleur}`} />
            {f.label}
            <span className="tabular-nums font-normal text-text-light">
              {f.n}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Carte>
  )
}
