import { withForm } from '../../../../hooks/formConfig.tsx'
import { useCan } from '../../../../hooks/useCan.ts'
import type {
  ServiceField,
  ServiceFieldCategory,
} from '../../../../types/serviceField.ts'
import { patientServiceFileFormOpts } from './form.patient.ts'

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
]

// Choix actifs, plus les valeurs déjà saisies qui ne le sont plus (choix archivé ou inconnu).
const choiceOptions = (field: ServiceField, current: unknown) => {
  const active = field.choices.filter((c) => !c.archived)
  const values = Array.isArray(current) ? current : [current]
  const stale = values
    .filter(
      (v): v is string =>
        typeof v === 'string' && v !== '' && !active.some((c) => c.key === v),
    )
    .map((v) => ({
      value: v,
      label: `${field.choices.find((c) => c.key === v)?.label ?? v} (archivé)`,
    }))
  return [...active.map((c) => ({ value: c.key, label: c.label })), ...stale]
}

// Champs actifs d'une catégorie, triés, masqués s'ils sont cliniques sans `clinical:read`.
export const visibleFields = (
  fields: ServiceField[],
  categoryId: string,
  canReadClinical: boolean,
) =>
  fields
    .filter(
      (f) =>
        !f.archived &&
        f.categoryId === categoryId &&
        (canReadClinical || !f.clinical),
    )
    .sort((a, b) => a.order - b.order)

const NO_CATEGORY: ServiceFieldCategory = {
  id: '',
  label: '',
  order: 0,
  dateField: null,
  archived: false,
}

// Un onglet du sous-dossier de service : sa date fixe éventuelle, puis ses champs configurables.
export const CategoryFields = withForm({
  ...patientServiceFileFormOpts,
  props: {
    category: NO_CATEGORY,
    fields: [] as ServiceField[],
  },
  render: function Render({ form, category, fields }) {
    const canReadClinical = useCan('clinical:read')

    return (
      <div
        data-category={category.id}
        className="h-fit flex-1 flex flex-col gap-2"
      >
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">
            {category.label} — dossier de ce service, non visible des autres
            services
          </h4>
          <div className="mt-1 ml-1 flex-1 border-t border-border" />
        </div>
        <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
          {category.dateField === 'entryDate' && (
            <form.AppField name="entryDate">
              {(field) => <field.DatePicker label="Date d'entrée" />}
            </form.AppField>
          )}
          {category.dateField === 'exitDate' && (
            <form.AppField name="exitDate">
              {(field) => <field.DatePicker label="Date de sortie" />}
            </form.AppField>
          )}
          {visibleFields(fields, category.id, canReadClinical).map((f) => (
            <form.AppField key={f.id} name={`fields.${f.key}`}>
              {(field) => {
                switch (f.type) {
                  case 'text':
                    return <field.Input label={f.label} />
                  case 'longtext':
                    return <field.TextArea label={f.label} />
                  case 'number':
                    return (
                      <field.Number
                        label={f.unit ? `${f.label} (${f.unit})` : f.label}
                      />
                    )
                  case 'date':
                    return <field.DatePicker label={f.label} />
                  case 'choice':
                    return (
                      <field.Select
                        label={f.label}
                        options={choiceOptions(f, field.state.value)}
                      />
                    )
                  case 'multichoice':
                    return (
                      <field.MultiSelect
                        label={f.label}
                        options={choiceOptions(f, field.state.value)}
                      />
                    )
                  case 'boolean':
                    return (
                      <field.Select
                        label={f.label}
                        options={BOOLEAN_OPTIONS}
                        clearable
                      />
                    )
                }
              }}
            </form.AppField>
          ))}
        </div>
      </div>
    )
  },
})
