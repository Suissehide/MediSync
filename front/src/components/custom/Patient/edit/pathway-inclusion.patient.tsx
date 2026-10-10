import { withForm } from '../../../../hooks/formConfig.tsx'
import type { ServiceField } from '../../../../types/serviceField.ts'
import { patientServiceFileFormOpts } from './form.patient.ts'
import { ServiceFieldsSection } from './serviceFields.patient.tsx'

// Champs du sous-dossier de service ; les champs configurables viennent du service (`fields`).
export const PathwayInclusionFields = withForm({
  ...patientServiceFileFormOpts,
  props: { fields: [] as ServiceField[] },
  render: ({ form, fields }) => {
    return (
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">
            Parcours et inclusion — dossier de ce service, non visible des
            autres services
          </h4>
          <div className="mt-1 ml-1 flex-1 border-t border-border" />
        </div>
        <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
          <form.AppField name="entryDate">
            {(field) => <field.DatePicker label="Date d'entrée" />}
          </form.AppField>
          <ServiceFieldsSection form={form} section="pathway" fields={fields} />
        </div>
      </div>
    )
  },
})
