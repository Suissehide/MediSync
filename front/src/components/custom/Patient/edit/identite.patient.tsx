import {
  CURRENT_ACTIVITY_OPTIONS,
  DISTANCE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  OCCUPATION_OPTIONS,
} from '../../../../constants/patient.constant.ts'
import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientFormOpts } from './form.patient.ts'

// Bloc « identité partagée entre les services de l'établissement » (décision 2.3 de la spec) :
// ces quatre champs restent sur `Patient`, donc visibles par n'importe quel service qui suit
// cette personne — d'où le titre explicite ci-dessous. Lié à `patientFormOpts`, pas au
// sous-dossier : à ne pas confondre avec le bloc « dossier de ce service » de
// `details.patient.tsx`, qui lui est propre au service courant et invisible des autres.
export const IdentiteFields = withForm({
  ...patientFormOpts,
  render: ({ form }) => {
    return (
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">
            Identité partagée entre les services de l'établissement
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
    )
  },
})
