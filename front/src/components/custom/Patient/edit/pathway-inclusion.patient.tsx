import {
  CARE_MODE_OPTIONS,
  ETP_DECISION_OPTIONS,
  MEDICAL_DIAGNOSIS_OPTIONS,
  NON_INCLUSION_DETAILS_OPTIONS,
  ORIENTATION_OPTIONS,
  PROGRAM_TYPE_OPTIONS,
} from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

export const PathwayInclusionFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
        <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
          <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
            Parcours et inclusion
          </span>
        </h4>
        <form.AppField name="medicalDiagnosis">
          {(field) => (
            <field.Select
              options={MEDICAL_DIAGNOSIS_OPTIONS}
              label="Diagnostic médical"
            />
          )}
        </form.AppField>
        <form.AppField name="entryDate">
          {(field) => <field.DatePicker label="Date d'entrée" />}
        </form.AppField>
        <form.AppField name="careMode">
          {(field) => (
            <field.Select
              options={CARE_MODE_OPTIONS}
              label="Mode de prise en charge"
            />
          )}
        </form.AppField>
        <form.AppField name="orientation">
          {(field) => (
            <field.Select options={ORIENTATION_OPTIONS} label="Orientation" />
          )}
        </form.AppField>
        <form.AppField name="etpDecision">
          {(field) => (
            <field.Select options={ETP_DECISION_OPTIONS} label="ETP décision" />
          )}
        </form.AppField>
        <form.AppField name="programType">
          {(field) => (
            <field.Select
              options={PROGRAM_TYPE_OPTIONS}
              label="Type de programme"
            />
          )}
        </form.AppField>
        <form.AppField name="nonInclusionDetails">
          {(field) => (
            <field.Select
              options={NON_INCLUSION_DETAILS_OPTIONS}
              label="Précision non inclusion"
            />
          )}
        </form.AppField>

        <form.AppField name="customContentDetails">
          {(field) => <field.TextArea label="Précision contenu personnalisé" />}
        </form.AppField>
        <form.AppField name="goal">
          {(field) => <field.TextArea label="Objectif" />}
        </form.AppField>
      </div>
    )
  },
})
