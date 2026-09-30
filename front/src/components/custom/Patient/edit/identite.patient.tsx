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
//
// (spec §5.3/§6) : `followedElsewhere` vit ici, pas sur le sous-dossier — c'est une
// propriété de la personne, pas du dossier de ce service. Trois états, pas deux :
// `true` affiche la mention, `false` et `undefined` n'affichent RIEN — ni
// l'un ni l'autre ne doit se distinguer à l'écran, un `undefined` qui afficherait « non » ou un
// espace réservé trahirait qu'on a posé la question à un service qui n'a pas encore de
// sous-dossier pour ce patient. Le booléen vient de `patient` (prop de `edit.patient.tsx`, lu
// par la même requête `GET /patient/:id` qui a déjà rempli tout le reste de l'écran) : aucun
// appel supplémentaire n'est déclenché par cet affichage. Le texte ne nomme ni le service, ni
// leur nombre, ni une date, ni un contenu — un simple fait, jamais une alerte.
export const IdentiteFields = withForm({
  ...patientFormOpts,
  props: {
    followedElsewhere: undefined as boolean | undefined,
  },
  render: ({ form, followedElsewhere }) => {
    return (
      <div className="h-fit flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-2">
          <h4 className="relative text-sm font-semibold">
            Identité partagée entre les services de l'établissement
          </h4>
          <div className="mt-1 ml-1 flex-1 border-t border-border" />
        </div>
        {followedElsewhere === true && (
          <p className="text-xs text-text-sidebar">
            Suivi existant dans un autre service de l'établissement.
          </p>
        )}
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
