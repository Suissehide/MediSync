import { useStore } from '@tanstack/react-form'
import dayjs from 'dayjs'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Search,
  UserCheck,
  X,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { GENDER_OPTIONS } from '../../../constants/patient.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import {
  usePatientIdentitySearch,
  usePatientMutations,
} from '../../../queries/usePatient.tsx'
import { usePatientServiceFileMutations } from '../../../queries/usePatientServiceFile.ts'
import type {
  CreatePatientParams,
  PatientIdentityMatch,
  PatientIdentitySearchResult,
  TimeOfDay,
} from '../../../types/patient.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'
import {
  type PathwayPeriod,
  PathwaySelector,
  usePathwaySelector,
} from '../pathwaySelector.tsx'

interface AddPatientFormProps {
  trigger?: React.ReactNode
}

function AddPatientForm({ trigger }: AddPatientFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const { enrollPatient, createPatient } = usePatientMutations()
  const identitySearch = usePatientIdentitySearch()
  const { attachExistingPatient } = usePatientServiceFileMutations()
  // `null` : aucune recherche encore lancée. `[]` : recherche faite, aucune identité trouvée —
  // les deux sont affichés différemment (tâche 13, spec §6).
  const [identityMatches, setIdentityMatches] = useState<
    PatientIdentityMatch[] | null
  >(null)
  // `hasMore` (tâche 13, tour de correction 1, point 4) : vingt résultats affichés au plus, sans
  // dire le total — voir `PatientIdentitySearchResult`. Affiché seulement quand une recherche a
  // été faite, comme `identityMatches`.
  const [identityMatchesHasMore, setIdentityMatchesHasMore] = useState(false)
  const pathwayState = usePathwaySelector()
  const { reset: resetPathways } = pathwayState

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: '',
      birthDate: '',
      startDate: dayjs.utc(),
    },
    onSubmit: async ({ value }) => {
      const periodToTimeOfDay: Record<PathwayPeriod, TimeOfDay> = {
        morning: 'MORNING',
        afternoon: 'AFTERNOON',
        fullday: 'ALL_DAY',
      }

      await enrollPatient.mutateAsync({
        patientData: {
          firstName: value.firstName,
          lastName: value.lastName,
          gender: value.gender,
          birthDate: value.birthDate,
        } satisfies CreatePatientParams,
        startDate: value.startDate.toISOString(),
        pathways: pathwayState.addedPathways.map((p) => ({
          tag: p.tag,
          timeOfDay: periodToTimeOfDay[p.period],
          thematicID: p.thematicID || undefined,
          type: p.type,
        })),
      })

      setOpen(false)
    },
  })

  const formResetRef = useRef(form.reset.bind(form))
  formResetRef.current = form.reset.bind(form)

  const resetAll = useCallback(() => {
    formResetRef.current()
    setStep(1)
    resetPathways()
    setIdentityMatches(null)
    setIdentityMatchesHasMore(false)
  }, [resetPathways])

  useEffect(() => {
    if (open) {
      resetAll()
    }
  }, [open, resetAll])

  const nextStep = () => setStep((s) => s + 1)
  const prevStep = () => setStep((s) => s - 1)

  const saveWithoutPathway = async () => {
    const { firstName, lastName, gender, birthDate } = form.state.values

    await createPatient.mutateAsync({
      firstName,
      lastName,
      gender,
      birthDate,
    } satisfies CreatePatientParams)

    setOpen(false)
  }

  // Recherche d'identité existante avant création (tâche 13, spec §6) : cherche dans tout
  // l'établissement, sur le prénom/nom déjà saisis dans le formulaire — jamais automatique, un
  // clic explicite. Le résultat ne porte jamais que l'identité (id, prénom, nom, date de
  // naissance) : rien de plus à afficher, rien de plus à masquer.
  // `useStore`, pas une lecture directe de `form.state.values` : TanStack Form ne rend ce
  // composant reactif a un champ que via `useStore`/`form.Subscribe` (voir addSlotForm.tsx) —
  // une lecture directe ici resterait figee sur les valeurs du premier rendu, laissant le
  // bouton "desactive" alors que les champs ont ete remplis.
  const firstNameValue = useStore(form.store, (state) => state.values.firstName)
  const lastNameValue = useStore(form.store, (state) => state.values.lastName)
  const canSearchIdentity =
    firstNameValue.trim().length > 0 || lastNameValue.trim().length > 0

  const searchIdentity = async () => {
    const { firstName, lastName, birthDate } = form.state.values
    const { results, hasMore }: PatientIdentitySearchResult =
      await identitySearch.mutateAsync({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        birthDate: birthDate || undefined,
      })
    setIdentityMatches(results)
    setIdentityMatchesHasMore(hasMore)
  }

  // Choisir une identité existante crée le sous-dossier dans le service courant, sans jamais
  // toucher à l'identité (consigne 3 du brief) : ce chemin n'appelle jamais `createPatient` ni
  // `PATCH /patient/:id`. Le cas « déjà suivi ici » (consigne 4) est dit par le toast de
  // `attachExistingPatient` (voir usePatientServiceFile.ts) ; la popup se ferme dans les deux
  // cas, comme pour la création.
  //
  // IRREVERSIBLE (revue tache 13, tour de correction 1 ; connu depuis la tache 7) : choisir la
  // mauvaise ligne d'une liste d'homonymes cree un sous-dossier vide dans ce service qu'aucun
  // ecran, aucune route, ne permet de retirer ensuite — voir le commentaire de
  // `PatientServiceFileDomain.attachToCurrentService` (back). Rien ici ne le confirme avant
  // d'agir : garder ce risque present a l'esprit avant d'ajouter, un jour, une confirmation ou un
  // "annuler".
  const chooseExistingIdentity = async (match: PatientIdentityMatch) => {
    await attachExistingPatient.mutateAsync(match.id)
    setOpen(false)
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="gradient"
            className="w-full"
            onClick={() => setOpen(true)}
          >
            Ajouter un patient
          </Button>
        )}
      </PopupTrigger>

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle>Ajouter un patient</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="flex flex-col gap-2"
          >
            {step === 1 && (
              <>
                <div className="w-full flex gap-4">
                  <form.AppField name="firstName">
                    {(field) => (
                      <field.Input label="Prénom" className="w-full" />
                    )}
                  </form.AppField>

                  <form.AppField name="lastName">
                    {(field) => <field.Input label="Nom" className="w-full" />}
                  </form.AppField>
                </div>

                <form.AppField name="birthDate">
                  {(field) => <field.DatePicker label="Date de naissance" />}
                </form.AppField>

                <form.AppField name="gender">
                  {(field) => (
                    <field.Select options={GENDER_OPTIONS} label="Genre" />
                  )}
                </form.AppField>

                <div className="flex flex-col gap-2 mt-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    disabled={!canSearchIdentity}
                    isLoading={identitySearch.isPending}
                    onClick={searchIdentity}
                  >
                    <Search className="w-4 h-4" /> Rechercher un patient
                    existant
                  </Button>

                  {identityMatches !== null && identityMatches.length === 0 && (
                    <em className="text-sm text-neutral-400">
                      Aucune identité existante trouvée dans l'établissement.
                    </em>
                  )}

                  {identityMatches !== null && identityMatches.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {identityMatches.map((match) => (
                        <li
                          key={match.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <span>
                            {match.firstName} {match.lastName}
                            {match.birthDate && (
                              <span className="text-neutral-400">
                                {' '}
                                — né(e) le{' '}
                                {dayjs(match.birthDate).format('DD/MM/YYYY')}
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            isLoading={
                              attachExistingPatient.isPending &&
                              attachExistingPatient.variables === match.id
                            }
                            onClick={() => chooseExistingIdentity(match)}
                          >
                            <UserCheck className="w-4 h-4" /> Choisir
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Troncature (tâche 13, tour de correction 1, point 4) : la recherche existe
                      pour éviter les doublons — ne pas dire qu'il y a plus de résultats ferait
                      croire à tort qu'une identité n'existe pas. Jamais un total exact, voir
                      `PatientIdentitySearchResult`. */}
                  {identityMatches !== null && identityMatchesHasMore && (
                    <em className="text-sm text-neutral-400">
                      Plus de {identityMatches.length} résultats : affinez la
                      recherche (prénom, nom, date de naissance) pour voir les
                      autres identités.
                    </em>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <form.AppField name="startDate">
                  {(field) => <field.DatePicker label="Date de début" />}
                </form.AppField>

                <em className="text-sm text-neutral-400 mb-2">
                  Ajoutez des parcours et organisez-les par ordre de priorité
                </em>

                <PathwaySelector state={pathwayState} />
              </>
            )}
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" /> Annuler
          </Button>

          {step > 1 && (
            <Button variant="outline" onClick={prevStep}>
              <ArrowLeft className="w-4 h-4" /> Précédent
            </Button>
          )}

          {step < 2 ? (
            <>
              <Button
                variant="outline"
                onClick={saveWithoutPathway}
                isLoading={createPatient.isPending}
              >
                <Save className="w-4 h-4" /> Créer sans parcours
              </Button>
              <Button
                variant="default"
                onClick={nextStep}
                disabled={createPatient.isPending}
              >
                Ajouter des parcours <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              onClick={() => form.handleSubmit()}
              isLoading={enrollPatient.isPending}
            >
              <Check className="w-4 h-4" /> Valider
            </Button>
          )}
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddPatientForm
