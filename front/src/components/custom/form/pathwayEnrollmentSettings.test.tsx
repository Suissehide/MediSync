import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { PathwayEnrollmentSettings } from './pathwayEnrollmentSettings.tsx'

let values: { motifRequired: boolean; firstAppointmentOnly: boolean }

function Harness() {
  const form = useAppForm({
    defaultValues: {
      name: '',
      color: '',
      mainTag: '',
      motifRequired: false,
      firstAppointmentOnly: false,
    },
  })
  return (
    <form.Subscribe selector={(s) => s.values}>
      {(v) => {
        values = v
        return <PathwayEnrollmentSettings form={form} />
      }}
    </form.Subscribe>
  )
}

describe('PathwayEnrollmentSettings', () => {
  it('écrit firstAppointmentOnly et motifRequired', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(
      screen.getByRole('radio', { name: /Tous les rendez-vous/ }),
    ).toBeChecked()
    expect(screen.getByRole('switch')).not.toBeChecked()

    await user.click(screen.getByRole('radio', { name: /premier créneau/ }))
    expect(values.firstAppointmentOnly).toBe(true)

    await user.click(screen.getByRole('switch', { name: /Demander un motif/ }))
    expect(values.motifRequired).toBe(true)
  })
})
