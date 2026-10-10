import { withForm } from '../../../../hooks/formConfig.tsx'
import { useCan } from '../../../../hooks/useCan.ts'
import type {
  ServiceField,
  ServiceFieldSection,
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

export const ServiceFieldsSection = withForm({
  ...patientServiceFileFormOpts,
  props: {
    section: 'pathway' as ServiceFieldSection,
    fields: [] as ServiceField[],
  },
  render: function Render({ form, section, fields }) {
    const canReadClinical = useCan('clinical:read')
    const visible = fields
      .filter(
        (f) =>
          !f.archived &&
          f.section === section &&
          (canReadClinical || !f.clinical),
      )
      .sort((a, b) => a.order - b.order)

    return visible.map((f) => (
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
    ))
  },
})
