import {
  Bookmark,
  LayoutTemplate,
  LoaderCircle,
  Route as RouteIcon,
  Save,
  User,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { MenuItem } from '../../../../constants/ui.constant.ts'
import { useAppForm } from '../../../../hooks/formConfig.tsx'
import { usePatientMutations } from '../../../../queries/usePatient.tsx'
import {
  usePatientServiceFileMutations,
  usePatientServiceFileQuery,
} from '../../../../queries/usePatientServiceFile.ts'
import type { Patient, UpdatePatientParams } from '../../../../types/patient.ts'
import type {
  PatientServiceFile,
  UpdatePatientServiceFileFields,
} from '../../../../types/patientServiceFile.ts'
import { Button } from '../../../ui/button.tsx'
import { FixedBar } from '../../../ui/fixedbar.tsx'
import { ToggleGroup, ToggleGroupItem } from '../../../ui/toggle-group.tsx'
import { DetailsFields } from './details.patient.tsx'
import {
  buildPatientDefaults,
  buildServiceFileDefaults,
  patientFormOpts,
  patientServiceFileFormOpts,
} from './form.patient.ts'
import { IdentiteFields } from './identite.patient.tsx'
import { IdentityFields } from './identity.patient.tsx'
import { OutcomeReviewFields } from './outcome-review.patient.tsx'
import { PathwayInclusionFields } from './pathway-inclusion.patient.tsx'

type PatientParam = {
  patient?: Patient
}

const menuItems: MenuItem[] = [
  { id: 'identity', label: 'Informations générales', icon: LayoutTemplate },
  { id: 'profile', label: 'Profil & Contexte', icon: User },
  { id: 'pathway', label: 'Parcours & Inclusion', icon: RouteIcon },
  { id: 'outcome', label: 'Sortie & Bilan', icon: Bookmark },
]

const Section = ({
  show,
  children,
}: {
  show: boolean
  children: React.ReactNode
}) => (
  <div className={`flex-col gap-4 ${show ? 'flex' : 'hidden'}`}>{children}</div>
)

export default function EditPatient({ patient }: PatientParam) {
  const { updatePatient } = usePatientMutations()
  const { updatePatientServiceFile } = usePatientServiceFileMutations()
  const [selected, setSelected] = useState<string>('identity')

  const {
    serviceFile,
    isPending: isServiceFilePending,
    isError: isServiceFileError,
  } = usePatientServiceFileQuery(patient?.id ?? '')

  // Le sous-dossier peut ne pas exister (absence normale : `serviceFile` vaut `null`, le
  // premier enregistrement le crée côté back — spec §2.1/§5.1), ou sa lecture peut avoir
  // échoué (403, 500 — un vrai refus, jamais confondu avec une absence par
  // `usePatientServiceFileQuery`). Dans les deux cas où elle n'a pas *abouti normalement*,
  // `serviceFileReady` reste faux : les blocs qui dépendent du sous-dossier restent démontés
  // plus bas (jamais affichés), et `handleSave` ne soumet jamais leur formulaire. Un formulaire
  // affiché avant que la lecture ait abouti partirait de seize défauts à '' non protégés côté
  // back pour treize d'entre eux — voir `form.patient.ts` pour le patron à ne pas reproduire.
  const serviceFileReady = !isServiceFilePending && !isServiceFileError

  // Correctif tour 1 (tâche 11, revue, Critiques C1/C2) — pourquoi une référence figée plutôt que
  // `serviceFile` lu en direct :
  // `FormApi.update()` (appelé à chaque rendu par `useForm`) recopie `options.defaultValues`
  // *sans condition*, mais ne touche `state.values` que si le formulaire n'a encore jamais été
  // touché. Passer `serviceFile` (qui change à chaque relecture — y compris celle que déclenche
  // notre propre `onSettled`) directement en `defaultValues` fait donc diverger, dès le premier
  // champ touché, ce que `isDefaultValue` croit être la valeur de référence de ce que l'écran
  // affiche réellement : le filtre de `changedFields` plus bas se met à comparer la saisie à une
  // cible qui a bougé sous ses pieds, et se met à désigner comme « changés » des champs que
  // personne n'a touchés.
  //
  // `serviceFileSnapshot` casse cette dérive : il ne bouge que deux fois — une fois quand la
  // lecture initiale aboutit (`hasHydratedServiceFile`, ci-dessous), une fois après un
  // enregistrement réussi (`onSuccess` du formulaire, plus bas), toujours à partir de ce que le
  // serveur a effectivement renvoyé. Une relecture en arrière-plan qui n'est pas la nôtre — y
  // compris celle déclenchée par notre propre `onSettled` — ne le touche jamais : c'est
  // précisément ce qui empêche une valeur périmée d'écraser une valeur posée ailleurs (C2).
  const [serviceFileSnapshot, setServiceFileSnapshot] =
    useState<PatientServiceFile | null>(null)
  const hasHydratedServiceFile = useRef(false)

  useEffect(() => {
    if (hasHydratedServiceFile.current || isServiceFilePending) {
      return
    }
    hasHydratedServiceFile.current = true
    setServiceFileSnapshot(serviceFile ?? null)
  }, [isServiceFilePending, serviceFile])

  // Même figeage côté patient, pour la même raison : `patient` est lui aussi une valeur de
  // requête vivante (`usePatientByIDQuery`, invalidée par notre propre `onSettled`), qui ne
  // doit pas faire bouger la référence pendant que le formulaire est touché. Le formulaire
  // patient renvoie toujours l'objet complet (jamais de filtre `isDefaultValue` sur ce corps,
  // voir `m3` de la revue) : figer ce côté sert `reset()`/I1, pas une propriété de charge
  // partielle.
  const [patientSnapshot] = useState<Patient | undefined>(patient)

  const patientForm = useAppForm({
    ...patientFormOpts,
    defaultValues: buildPatientDefaults(patientSnapshot),
    onSubmit: ({ value, formApi }) => {
      if (!patient?.id) {
        return
      }

      // Correctif tour 2 (tâche 11, revue, mineur m3) — exactement la même garde que côté
      // sous-dossier (`serviceFileForm.onSubmit`, plus bas) : sans elle, ce formulaire
      // s'enregistrait à chaque clic sur « Sauvegarder », même quand aucun de ses champs n'avait
      // été touché — un toast « Patient modifié avec succès » qui ment, et une écriture qui
      // réécrit la photographie lue par-dessus une modification faite entre-temps par quelqu'un
      // d'autre. Le corps envoyé reste l'objet complet (le back n'accepte que ça sur cette
      // route, contrairement au sous-dossier qui accepte une charge partielle) : seule la
      // décision d'écrire ou non change.
      const changedFields = (
        Object.keys(value) as (keyof typeof value)[]
      ).filter((field) => formApi.getFieldMeta(field)?.isDefaultValue === false)

      if (changedFields.length === 0) {
        return
      }

      const updatePatientData = {
        id: patient.id,
        ...value,
      } satisfies UpdatePatientParams

      updatePatient.mutate(updatePatientData, {
        onSuccess: (response) => {
          // Referme la barre (I1) et resynchronise valeurs et défauts, pour que le prochain
          // enregistrement compare à nouveau à ce que le serveur vient de confirmer.
          formApi.reset(buildPatientDefaults(response))
        },
      })
    },
  })

  const serviceFileForm = useAppForm({
    ...patientServiceFileFormOpts,
    defaultValues: buildServiceFileDefaults(serviceFileSnapshot),
    onSubmit: ({ value, formApi }) => {
      if (!patient?.id || !serviceFileReady) {
        return
      }

      // Seuls les champs réellement modifiés depuis la lecture partent dans le corps du PATCH —
      // jamais un objet reconstruit à partir des défauts de `patientServiceFileFormOpts`.
      // `isDefaultValue` (pas `isDirty`, qui ne redevient jamais faux une fois un champ touché,
      // même reporté à sa valeur d'origine) reflète l'écart réel avec ce qui a été lu — et reste
      // vrai d'un enregistrement à l'autre parce que `defaultValues` vient désormais de
      // `serviceFileSnapshot`, une référence que rien ne bouge sans notre accord (voir plus
      // haut).
      const changedFields = (
        Object.keys(value) as (keyof typeof value)[]
      ).filter((field) => formApi.getFieldMeta(field)?.isDefaultValue === false)

      if (changedFields.length === 0) {
        return
      }

      const changedBody = Object.fromEntries(
        changedFields.map((field) => [field, value[field]]),
      ) as UpdatePatientServiceFileFields

      updatePatientServiceFile.mutate(
        {
          patientID: patient.id,
          ...changedBody,
        },
        {
          onSuccess: (response) => {
            // Même correctif que côté patient : referme la barre (I1), et surtout avance
            // `serviceFileSnapshot` à ce que le serveur vient de confirmer — jamais à ce
            // qu'une relecture en arrière-plan pourrait rapporter entre-temps.
            setServiceFileSnapshot(response)
            formApi.reset(buildServiceFileDefaults(response))
          },
        },
      )
    },
  })

  const isSaving = updatePatient.isPending || updatePatientServiceFile.isPending

  // Une seule action pour l'utilisateur, deux écritures indépendantes : chaque mutation a son
  // propre toast de succès/erreur (`usePatient.tsx`, `usePatientServiceFile.ts`), donc si l'une
  // échoue l'autre le dit distinctement — jamais un message générique qui laisserait croire que
  // tout a été enregistré. `serviceFileForm.handleSubmit()` n'est jamais appelé si la lecture du
  // sous-dossier n'a pas abouti.
  //
  // Correctif tour 2 (tâche 11, revue, mineur m5) — les deux `await` ci-dessous ne mettent PAS les
  // deux soumissions en séquence : `handleSubmit` tel qu'exposé par `useForm`
  // (`@tanstack/react-form/dist/esm/useForm.js`) appelle `formApi._handleSubmit(...)` sans en
  // renvoyer la promesse, donc il rend `undefined` et l'`await` ne porte sur rien. Les deux
  // `_handleSubmit` démarrent donc l'un après l'autre dans le même tick, pas l'un après la fin
  // de l'autre — en pratique en parallèle. Sans conséquence : les deux écritures sont
  // indépendantes (patient et sous-dossier, deux ressources, deux toasts distincts), donc aucun
  // des deux n'a besoin d'attendre le résultat de l'autre. Les `await` restent ici par
  // cohérence avec la forme habituelle d'un gestionnaire de soumission, pas parce qu'un ordre
  // réel est garanti.
  const handleSave = async () => {
    await patientForm.handleSubmit()
    if (serviceFileReady) {
      await serviceFileForm.handleSubmit()
    }
  }

  // Correctif tour 2 (tâche 11, revue, mineur m2) — la touche Entrée doit de nouveau enregistrer,
  // comme sur l'ancien écran à un seul `<form>`. Le remède n'est PAS de rendre chacun des deux
  // formulaires TanStack Form indépendant (un `<form>` par bloc) : deux `<form>` imbriqués ou
  // côte à côte referaient le défaut que ce correctif doit éviter — l'Entrée dans un champ ne
  // déclencherait que LE formulaire natif qui le contient, jamais les deux écritures. Un seul
  // `<form>` natif enveloppe donc tout l'écran ; son `onSubmit` appelle le même `handleSave` que
  // le bouton, qui soumet les deux formulaires TanStack Form l'un après l'autre (voir plus haut,
  // m5, pour ce que « l'un après l'autre » veut dire réellement).
  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleSave()
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleFormSubmit}>
      <div className="mt-4">
        <ToggleGroup
          value={selected}
          onValueChange={(v: string) => {
            if (v) {
              setSelected(v)
            }
          }}
        >
          {menuItems.map(({ id, label, icon: Icon }) => (
            <ToggleGroupItem key={id} value={id}>
              {Icon && <Icon className="h-4 w-4" />}
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Section show={selected === 'identity'}>
        <IdentityFields form={patientForm} />
      </Section>
      <Section show={selected === 'profile'}>
        {/* Tâche 14 : `patient` (pas `patientSnapshot`, qui ne sert qu'à figer les défauts du
            formulaire) porte `followedElsewhere` — champ non éditable, jamais dans
            `patientFormOpts`. Aucun appel réseau supplémentaire : c'est la même lecture qui a
            déjà rempli cet écran. */}
        <IdentiteFields
          form={patientForm}
          followedElsewhere={patient?.followedElsewhere}
        />
        {serviceFileReady && <DetailsFields form={serviceFileForm} />}
      </Section>
      <Section show={selected === 'pathway'}>
        {serviceFileReady && <PathwayInclusionFields form={serviceFileForm} />}
      </Section>
      <Section show={selected === 'outcome'}>
        {serviceFileReady && <OutcomeReviewFields form={serviceFileForm} />}
      </Section>

      <patientForm.Subscribe selector={(state) => state.isDirty}>
        {(isPatientDirty) => (
          <serviceFileForm.Subscribe selector={(state) => state.isDirty}>
            {(isServiceFileDirty) => (
              <FixedBar
                open={isPatientDirty || isServiceFileDirty}
                leftSlot={
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                }
                title="Modifications non sauvegardées"
                subtitle="Pensez à sauvegarder avant de changer d'onglet"
              >
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Sauvegarder
                </Button>
              </FixedBar>
            )}
          </serviceFileForm.Subscribe>
        )}
      </patientForm.Subscribe>
    </form>
  )
}
