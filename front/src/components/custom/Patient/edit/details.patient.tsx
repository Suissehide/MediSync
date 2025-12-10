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
        <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
          <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
            <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
              Informations personnelles et sociales
            </span>
          </h4>
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
                label="Niveau d’étude"
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

        <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
          <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
            <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
              Références et contexte
            </span>
          </h4>
          <form.AppField name="referringCaregiver">
            {(field) => <field.TextArea label="Soignant référent" />}
          </form.AppField>
          <form.AppField name="followUpToDo">
            {(field) => <field.TextArea label="Suivi à régulariser" />}
          </form.AppField>
        </div>

        <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
          <h4 className="relative mt-2 mb-4 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
            <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
              Notes
            </span>
          </h4>
          <form.AppField name="notes">
            {(field) => <field.TextArea label="Notes" />}
          </form.AppField>
          <form.AppField name="details">
            {(field) => <field.TextArea label="Détails" />}
          </form.AppField>
        </div>
      </>
    )
  },
})
