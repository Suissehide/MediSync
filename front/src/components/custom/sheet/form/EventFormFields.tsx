import { useStore } from '@tanstack/react-form'
import { useMemo } from 'react'

import {
  getThemeOptionsByRole,
  SLOT_DURATION_OPTIONS,
  SLOT_LOCATION_OPTIONS,
  THEMATICS,
} from '../../../../constants/slot.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { useSoignantStore } from '../../../../store/useSoignantStore.ts'
import { eventFormOpts } from './eventFormOpts.ts'

export const EventFormFields = withForm({
  ...eventFormOpts,
  render: ({ form }) => {
    const soignants = useSoignantStore((state) => state.soignants)
    const soignantOptions = soignants.map((soignant) => ({
      value: soignant.id,
      label: soignant.name,
    }))

    const isIndividual = useStore(
      form.store,
      (state) => state.values.isIndividual,
    )

    const selectedSoignantId = useStore(
      form.store,
      (state) => state.values.soignant,
    )

    const selectedSoignant = soignants.find((s) => s.id === selectedSoignantId)

    const thematicOptions = useMemo(() => {
      return selectedSoignant
        ? getThemeOptionsByRole(THEMATICS, selectedSoignant.name)
        : []
    }, [selectedSoignant])

    return (
      <>
        <form.AppField
          name="soignant"
          listeners={{
            onChange: ({ value }) => {
              if (value) {
                form.setFieldValue('thematic', '')
              }
            },
          }}
        >
          {(field) => (
            <field.Select options={soignantOptions} label="Soignant" />
          )}
        </form.AppField>

        <form.AppField name="thematic">
          {(field) => (
            <field.Select
              options={thematicOptions}
              label="Thématique"
              disabled={!selectedSoignant}
            />
          )}
        </form.AppField>

        <form.AppField name="location">
          {(field) => (
            <field.Select options={SLOT_LOCATION_OPTIONS} label="Lieu" />
          )}
        </form.AppField>

        <form.AppField name="isIndividual">
          {(field) => (
            <field.Toggle options={['Individuel', 'Multiple']} label="Type" />
          )}
        </form.AppField>

        {isIndividual ? (
          <form.AppField name="duration">
            {(field) => (
              <field.Select
                options={SLOT_DURATION_OPTIONS}
                label="Durée par défaut"
              />
            )}
          </form.AppField>
        ) : (
          <form.AppField name="capacity">
            {(field) => <field.Number label="Capacité maximum" />}
          </form.AppField>
        )}

        <form.AppField name="color">
          {(field) => <field.ColorPicker label="Couleur" />}
        </form.AppField>

        <form.AppField name="description">
          {(field) => <field.TextArea label="Description" />}
        </form.AppField>
      </>
    )
  },
})
