import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  douzeDerniersMois,
  PERIOD_FORMAT,
  PeriodPicker,
  trimestreEnCours,
} from './periodPicker.tsx'

dayjs.extend(utc)

const avecLocalisation = (enfant: ReactNode) => (
  <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
    {enfant}
  </LocalizationProvider>
)

describe('douzeDerniersMois', () => {
  it('va du premier du mois il y a onze mois a aujourd hui', () => {
    const periode = douzeDerniersMois(dayjs.utc('2026-10-10'))
    expect(periode.from.format(PERIOD_FORMAT)).toBe('2025-11-01')
    expect(periode.to.format(PERIOD_FORMAT)).toBe('2026-10-10')
  })
})

describe('trimestreEnCours', () => {
  it('donne le trimestre civil en cours (octobre)', () => {
    const periode = trimestreEnCours(dayjs.utc('2026-10-10'))
    expect(periode.from.format(PERIOD_FORMAT)).toBe('2026-10-01')
    expect(periode.to.format(PERIOD_FORMAT)).toBe('2026-12-31')
  })

  it('donne le trimestre civil en cours (fevrier)', () => {
    const periode = trimestreEnCours(dayjs.utc('2026-02-15'))
    expect(periode.from.format(PERIOD_FORMAT)).toBe('2026-01-01')
    expect(periode.to.format(PERIOD_FORMAT)).toBe('2026-03-31')
  })
})

describe('PeriodPicker, prereglages', () => {
  it('appelle onChange avec les bornes du trimestre au clic sur Trimestre', async () => {
    const onChange = vi.fn()
    render(
      avecLocalisation(
        <PeriodPicker
          periode={{
            from: dayjs.utc('2026-01-01'),
            to: dayjs.utc('2026-12-31'),
          }}
          onChange={onChange}
          presets
        />,
      ),
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Trimestre' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const periode = onChange.mock.calls[0][0]
    expect(periode.from.format(PERIOD_FORMAT)).toBe(
      trimestreEnCours().from.format(PERIOD_FORMAT),
    )
    expect(periode.to.format(PERIOD_FORMAT)).toBe(
      trimestreEnCours().to.format(PERIOD_FORMAT),
    )
  })

  it('n affiche pas le segmente de prereglages sans la prop presets', () => {
    render(
      avecLocalisation(
        <PeriodPicker
          periode={{
            from: dayjs.utc('2026-01-01'),
            to: dayjs.utc('2026-12-31'),
          }}
          onChange={vi.fn()}
        />,
      ),
    )

    expect(screen.queryByText('Trimestre')).not.toBeInTheDocument()
    expect(screen.queryByText('12 derniers mois')).not.toBeInTheDocument()
  })
})
