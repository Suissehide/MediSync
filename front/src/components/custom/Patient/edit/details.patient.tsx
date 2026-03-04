import {
  CURRENT_ACTIVITY_OPTIONS,
  DISTANCE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  OCCUPATION_OPTIONS,
} from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

export const DetailsFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <>
        <div className="h-fit flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mt-2">
            <h4 className="relative text-md font-semibold">
              Informations personnelles et sociales
            </h4>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>
          <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
            <form.AppField name="distance">
              {(field) => (
                <field.Select
                  options={DISTANCE_OPTIONS}
                  label="Distance d'habitation"
                />
              )}
            </form.AppField>
            <form.AppField name="educationLevel">
              {(field) => (
                <field.Select
                  options={EDUCATION_LEVEL_OPTIONS}
                  label="Niveau d'étude"
                />
              )}
            </form.AppField>
            <form.AppField name="occupation">
              {(field) => (
                <field.Select options={OCCUPATION_OPTIONS} label="Profession" />
              )}
            </form.AppField>
            <form.AppField name="currentActivity">
              {(field) => (
                <field.Select
                  options={CURRENT_ACTIVITY_OPTIONS}
                  label="Activité actuelle"
                />
              )}
            </form.AppField>
          </div>
        </div>

        <div className="h-fit flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mt-2">
            <h4 className="relative text-md font-semibold">
              Références et contexte
            </h4>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>
          <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
            <form.AppField name="referringCaregiver">
              {(field) => <field.TextArea label="Soignant référent" />}
            </form.AppField>
            <form.AppField name="followUpToDo">
              {(field) => <field.TextArea label="Suivi à régulariser" />}
            </form.AppField>
          </div>
        </div>

        <div className="h-fit flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mt-2">
            <h4 className="relative text-md font-semibold">Notes</h4>
            <div className="mt-1 ml-1 flex-1 border-t border-border" />
          </div>
          <div className="mt-2 bg-input rounded-lg p-6 flex flex-col gap-3">
            <form.AppField name="notes">
              {(field) => <field.TextArea label="Notes" />}
            </form.AppField>
            <form.AppField name="details">
              {(field) => <field.TextArea label="Détails" />}
            </form.AppField>
          </div>
        </div>
      </>
    )
  },
})
