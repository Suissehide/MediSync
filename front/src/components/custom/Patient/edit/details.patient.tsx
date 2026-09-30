import { withForm } from '../../../../hooks/formConfig.tsx'
import { patientServiceFileFormOpts } from './form.patient.ts'

// Bloc « dossier de ce service » (décision 2.3 de la spec) : ces quatre champs vivent sur le
// sous-dossier de service (`types/patientServiceFile.ts`) — invisibles des autres services de
// l'établissement, d'où le titre explicite ci-dessous. Lié à
// `patientServiceFileFormOpts`, pas au formulaire patient : à ne pas confondre avec le bloc
// « identité partagée » de `identite.patient.tsx`. `edit.patient.tsx` ne monte ce composant
// qu'une fois la lecture du sous-dossier résolue (`serviceFileReady`) — voir ce fichier pour la
// raison.
export const DetailsFields = withForm({
  ...patientServiceFileFormOpts,
  render: ({ form }) => {
    return (
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">
            Dossier de ce service — non visible des autres services
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

        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">Notes</h4>
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
    )
  },
})
