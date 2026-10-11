import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ServiceField } from '../../../types/serviceField.ts'
import ServiceFieldForm from './serviceFieldForm.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

const champ = (clinical: boolean): ServiceField => ({
  id: 'f1',
  key: 'orientation',
  label: 'Orientation',
  type: 'choice',
  categoryId: 'c1',
  order: 0,
  clinical,
  unit: null,
  archived: false,
  choices: [],
})

const monter = (field: ServiceField) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServiceFieldForm categoryId="c1" field={field} />
    </QueryClientProvider>,
  )
}

describe('case Clinique en edition', () => {
  it('reste visible (desactivee mais rendue) et cochee quand le champ est clinique', async () => {
    monter(champ(true))
    await userEvent.click(screen.getByRole('button', { name: /modifier/i }))

    const checkbox = await screen.findByRole('checkbox', { name: 'Clinique' })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).toBeDisabled()
    expect(checkbox).toBeChecked()
  })

  it('reste visible et decochee quand le champ n est pas clinique', async () => {
    monter(champ(false))
    await userEvent.click(screen.getByRole('button', { name: /modifier/i }))

    const checkbox = await screen.findByRole('checkbox', { name: 'Clinique' })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).toBeDisabled()
    expect(checkbox).not.toBeChecked()
  })
})
