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
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-md font-semibold">Sortie et bilan</h4>
          <div className="mt-1 ml-1 flex-1 border-t border-border" />
        </div>

        <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
          <form.AppField name="exitDate">
            {(field) => <field.DatePicker label="Date de sortie" />}
          </form.AppField>
          <form.AppField name="stopReason">
            {(field) => (
              <field.Select
                options={STOP_REASON_OPTIONS}
                label="Motif d'arrêt de programme"
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
      </div>
    )
  },
})
