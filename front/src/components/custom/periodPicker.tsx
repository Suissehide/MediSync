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

// Raccourcis d'année civile et plage libre : un segment n'est actif que si la période tombe pile sur lui.
export function PeriodPicker({
  periode,
  onChange,
}: {
  periode: Periode
  onChange: (periode: Periode) => void
}) {
  const anneeActive = ANNEES.find((annee) => {
    const civile = anneeCivile(annee)
    return (
      periode.from.isSame(civile.from, 'day') &&
      periode.to.isSame(civile.to, 'day')
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
        value={anneeActive ? String(anneeActive) : ''}
        onValueChange={(valeur) =>
          valeur && onChange(anneeCivile(Number(valeur)))
        }
      >
        {ANNEES.map((annee) => (
          <ToggleGroupItem key={annee} value={String(annee)}>
            {annee}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-2 text-sm text-text-light">
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
