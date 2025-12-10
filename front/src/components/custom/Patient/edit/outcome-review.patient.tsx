import {
  ETP_FINAL_OUTCOME_OPTIONS,
  STOP_REASON_OPTIONS,
} from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

export const OutcomeReviewFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
        <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
          <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
            Sortie et bilan
          </span>
        </h4>
        <form.AppField name="exitDate">
          {(field) => <field.DatePicker label="Date de sortie" />}
        </form.AppField>
        <form.AppField name="stopReason">
          {(field) => (
            <field.Select
              options={STOP_REASON_OPTIONS}
              label="Motif d’arrêt de programme"
            />
          )}
        </form.AppField>
        <form.AppField name="etpFinalOutcome">
          {(field) => (
            <field.Select
              options={ETP_FINAL_OUTCOME_OPTIONS}
              label="Point final parcours ETP"
            />
          )}
        </form.AppField>
      </div>
    )
  },
})
