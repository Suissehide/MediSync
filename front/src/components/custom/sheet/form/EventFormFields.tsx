import { useStore } from '@tanstack/react-form'
import { useEffect, useMemo } from 'react'

import { SLOT_LOCATION_OPTIONS } from '../../../../constants/slot.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { useThematicQueries } from '../../../../queries/useThematic.ts'
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

    const { thematics } = useThematicQueries()

    const isIndividual = useStore(
      form.store,
      (state) => state.values.isIndividual,
    )

    const selectedSoignantId = useStore(
      form.store,
      (state) => state.values.soignant,
    )

    const selectedSoignant = soignants.find((s) => s.id === selectedSoignantId)

    const currentThematic = useStore(
      form.store,
      (state) => state.values.thematic,
    )

    const thematicOptions = useMemo(() => {
      return selectedSoignant
        ? (thematics
            ?.filter((t) =>
              t.soignants.some((s) => s.id === selectedSoignant.id),
            )
            .map((t) => ({ value: t.name, label: t.name })) ?? [])
        : []
    }, [selectedSoignant, thematics])

    useEffect(() => {
      if (
        currentThematic &&
        selectedSoignant &&
        !thematicOptions.some((o) => o.value === currentThematic)
      ) {
        form.setFieldValue('thematic', '')
      }
    }, [currentThematic, selectedSoignant, thematicOptions, form])

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
              disabled={!selectedSoignant || thematicOptions.length === 0}
              placeholder={
                selectedSoignant
                  ? thematicOptions.length === 0
                    ? 'Aucune thématique associée'
                    : 'Sélectionnez une thématique'
                  : 'Sélectionnez un soignant'
              }
            />
          )}
        </form.AppField>

        <form.AppField name="location">
          {(field) => (
            <field.Select options={SLOT_LOCATION_OPTIONS} label="Lieu" />
          )}
        </form.AppField>

        <div className="flex gap-2 items-center">
          <form.AppField name="isIndividual">
            {(field) => (
              <field.Toggle options={['Individuel', 'Multiple']} label="Type" />
            )}
          </form.AppField>

          {!isIndividual && (
            <form.AppField name="capacity">
              {(field) => (
                <field.Number label="Capacité maximum" className="w-full" />
              )}
            </form.AppField>
          )}
        </div>

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
