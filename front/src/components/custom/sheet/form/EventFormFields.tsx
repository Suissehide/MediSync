import { useStore } from '@tanstack/react-form'
import { useEffect, useMemo } from 'react'

import { withForm } from '../../../../hooks/formConfig.tsx'
import { useLocationQueries } from '../../../../queries/useLocation.ts'
import { useThematicQueries } from '../../../../queries/useThematic.ts'
import { useSoignantStore } from '../../../../store/useSoignantStore.ts'
import { FieldInfo } from '../../../ui/fieldInfo.tsx'
import { FormField } from '../../../ui/formField.tsx'
import { MultiSelect } from '../../../ui/select.tsx'
import { eventFormOpts } from './eventFormOpts.ts'

export const EventFormFields = withForm({
  ...eventFormOpts,
  render: ({ form }) => {
    const soignants = useSoignantStore((state) => state.soignants)
    const soignantOptions = useMemo(
      () =>
        [...soignants]
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
          .map((soignant) => ({
            value: soignant.id,
            label: soignant.name,
          })),
      [soignants],
    )

    const { thematics } = useThematicQueries()
    const { locations } = useLocationQueries()
    const locationOptions = useMemo(
      () =>
        [...(locations ?? [])]
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
          .map((l) => ({ value: l.id, label: l.name })),
      [locations],
    )

    const isIndividual = useStore(
      form.store,
      (state) => state.values.isIndividual,
    )

    const selectedSoignantIds = useStore(
      form.store,
      (state) => state.values.soignantIDs,
    )

    const currentThematic = useStore(
      form.store,
      (state) => state.values.thematic,
    )

    const thematicOptions = useMemo(() => {
      const selected = soignants.filter((s) =>
        selectedSoignantIds.includes(s.id),
      )
      const map = new Map<string, { value: string; label: string }>()
      for (const soignant of selected) {
        for (const t of
          thematics?.filter((t) =>
            t.soignants.some((ss) => ss.id === soignant.id),
          ) ?? []) {
          map.set(t.id, { value: t.name, label: t.name })
        }
      }
      return [...map.values()].sort((a, b) =>
        a.label.localeCompare(b.label, 'fr'),
      )
    }, [selectedSoignantIds, soignants, thematics])

    useEffect(() => {
      if (
        currentThematic &&
        !thematicOptions.some((o) => o.value === currentThematic)
      ) {
        form.setFieldValue('thematic', '')
      }
    }, [currentThematic, thematicOptions, form])

    return (
      <>
        <form.Field name="soignantIDs">
          {(field) => (
            <FormField>
              <div className="text-sm text-text-light font-medium">Soignants</div>
              <MultiSelect
                options={soignantOptions}
                value={field.state.value}
                onChange={(values) => field.handleChange(values)}
                placeholder="Sélectionnez un ou plusieurs soignants"
              />
              <FieldInfo field={field} />
            </FormField>
          )}
        </form.Field>

        <form.AppField name="thematic">
          {(field) => (
            <field.Select
              options={thematicOptions}
              label="Thématique"
              disabled={
                selectedSoignantIds.length === 0 ||
                thematicOptions.length === 0
              }
              placeholder={
                selectedSoignantIds.length === 0
                  ? 'Sélectionnez un soignant'
                  : thematicOptions.length === 0
                    ? 'Aucune thématique associée'
                    : 'Sélectionnez une thématique'
              }
            />
          )}
        </form.AppField>

        <form.AppField name="locationID">
          {(field) => <field.Select options={locationOptions} label="Lieu" />}
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
