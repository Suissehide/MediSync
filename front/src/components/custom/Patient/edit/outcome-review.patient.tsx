import {
  ETP_FINAL_OUTCOME_OPTIONS,
  STOP_REASON_OPTIONS,
} from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientServiceFileFormOpts } from './form.patient.ts'

// Tous ces champs vivent sur le sous-dossier de service (`types/patientServiceFile.ts`, étape 3
// du multi-tenant) : leur découpage ne change pas, seul le formulaire auquel ils sont liés
// change (`patientServiceFileFormOpts` au lieu de `patientFormOpts`). `edit.patient.tsx` ne
// monte ce composant qu'une fois la lecture du sous-dossier résolue (`serviceFileReady`).
export const OutcomeReviewFields = withForm({
  ...patientServiceFileFormOpts,
  render: ({ form }) => {
    return (
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">Sortie et bilan</h4>
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
