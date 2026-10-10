import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { DatePicker } from '@/components/ui/datePicker.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'

dayjs.extend(utc)

export type Periode = { from: Dayjs; to: Dayjs }

export const PERIOD_FORMAT = 'YYYY-MM-DD'

export const anneeCivile = (annee: number): Periode => ({
  from: dayjs.utc(`${annee}-01-01`),
  to: dayjs.utc(`${annee}-12-31`),
})

export const ANNEES = [0, 1, 2].map((recul) => dayjs.utc().year() - recul)

// Premier du mois il y a onze mois -> aujourd'hui.
export const douzeDerniersMois = (
  aujourdhui: Dayjs = dayjs.utc(),
): Periode => ({
  from: aujourdhui.startOf('month').subtract(11, 'month'),
  to: aujourdhui,
})

// Trimestre civil en cours (sans dependre du plugin quarterOfYear).
export const trimestreEnCours = (aujourdhui: Dayjs = dayjs.utc()): Periode => {
  const debut = aujourdhui
    .startOf('month')
    .subtract(aujourdhui.month() % 3, 'month')
  return { from: debut, to: debut.add(3, 'month').subtract(1, 'day') }
}

const PREREGLAGES = [
  { id: 'douzeMois', label: '12 derniers mois', construire: douzeDerniersMois },
  { id: 'trimestre', label: 'Trimestre', construire: trimestreEnCours },
] as const

const SEGMENT_ACTIF =
  'data-[state=on]:bg-segment-actif data-[state=on]:text-white'

// Raccourcis d'année civile et plage libre : un segment n'est actif que si la période tombe pile sur lui.
export function PeriodPicker({
  periode,
  onChange,
  presets,
}: {
  periode: Periode
  onChange: (periode: Periode) => void
  presets?: boolean
}) {
  const anneeActive = ANNEES.find((annee) => {
    const civile = anneeCivile(annee)
    return (
      periode.from.isSame(civile.from, 'day') &&
      periode.to.isSame(civile.to, 'day')
    )
  })

  const prereglageActif = PREREGLAGES.find(({ construire }) => {
    const bornes = construire()
    return (
      periode.from.isSame(bornes.from, 'day') &&
      periode.to.isSame(bornes.to, 'day')
    )
  })

  const deplacerBorne = (borne: 'from' | 'to') => (valeur: Dayjs | null) => {
    if (valeur?.isValid()) {
      onChange({ ...periode, [borne]: valeur })
    }
  }

  return (
    <>
      <ToggleGroup
        className="bg-carte"
        value={anneeActive ? String(anneeActive) : ''}
        onValueChange={(valeur) =>
          valeur && onChange(anneeCivile(Number(valeur)))
        }
      >
        {ANNEES.map((annee) => (
          <ToggleGroupItem
            key={annee}
            value={String(annee)}
            className={SEGMENT_ACTIF}
          >
            {annee}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {presets && (
        <ToggleGroup
          className="bg-carte"
          value={prereglageActif?.id ?? ''}
          onValueChange={(valeur) => {
            const prereglage = PREREGLAGES.find((p) => p.id === valeur)
            if (prereglage) {
              onChange(prereglage.construire())
            }
          }}
        >
          {PREREGLAGES.map(({ id, label }) => (
            <ToggleGroupItem key={id} value={id} className={SEGMENT_ACTIF}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-text-light">
        <span>du</span>
        <DatePicker
          value={periode.from}
          onChange={deplacerBorne('from')}
          className="w-40"
          format="DD/MM/YYYY"
          maxDate={periode.to}
        />
        <span>au</span>
        <DatePicker
          value={periode.to}
          onChange={deplacerBorne('to')}
          className="w-40"
          format="DD/MM/YYYY"
          minDate={periode.from}
        />
      </div>
    </>
  )
}
