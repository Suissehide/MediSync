import { useStore } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight, Check, Save, UserCheck, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { GENDER_OPTIONS } from '../../../constants/patient.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import {
  usePatientIdentitySearch,
  usePatientMutations,
} from '../../../queries/usePatient.tsx'
import { usePatientServiceFileMutations } from '../../../queries/usePatientServiceFile.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import type {
  CreatePatientParams,
  PatientIdentityMatch,
  SearchPatientIdentityParams,
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
import { PathwaySelector, usePathwaySelector } from '../pathwaySelector.tsx'

interface AddPatientFormProps {
  trigger?: React.ReactNode
}

function AddPatientForm({ trigger }: AddPatientFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const { enrollPatient, createPatient } = usePatientMutations()
  const { attachExistingPatient } = usePatientServiceFileMutations()
  const [searchParams, setSearchParams] =
    useState<SearchPatientIdentityParams | null>(null)
  const identitySearch = usePatientIdentitySearch(searchParams)
  // `undefined` : aucune recherche encore faite ; `[]` : aucune identité trouvée.
  const identityMatches = identitySearch.data?.results
  const identityMatchesHasMore = identitySearch.data?.hasMore ?? false
  const pathwayState = usePathwaySelector()
  const { reset: resetPathways } = pathwayState

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: '',
      birthDate: '',
    },
    onSubmit: async ({ value }) => {
      const { patient } = await enrollPatient.mutateAsync({
        patientData: {
          firstName: value.firstName,
          lastName: value.lastName,
          gender: value.gender,
          birthDate: value.birthDate,
        } satisfies CreatePatientParams,
        pathways: pathwayState.enrollments,
      })

      setOpen(false)
      await goToPatient(patient.id)
    },
  })

  const formResetRef = useRef(form.reset.bind(form))
  formResetRef.current = form.reset.bind(form)

  const resetAll = useCallback(() => {
    formResetRef.current()
    setStep(1)
    resetPathways()
    setSearchParams(null)
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

    const patient = await createPatient.mutateAsync({
      firstName,
      lastName,
      gender,
      birthDate,
    } satisfies CreatePatientParams)

    setOpen(false)
    await goToPatient(patient.id)
  }

  const goToPatient = async (patientID: string) => {
    const { establishmentId, serviceId } = useAuthStore.getState().context ?? {}
    if (!establishmentId || !serviceId) {
      return
    }
    await navigate({
      to: '/e/$establishmentId/s/$serviceId/patient/$patientID',
      params: { establishmentId, serviceId, patientID },
    })
  }

  // Recherche d'identité existante dans l'établissement, lancée d'elle-même 300 ms après la
  // dernière frappe. `useStore` : seule lecture réactive des champs avec TanStack Form.
  const firstNameValue = useStore(form.store, (state) => state.values.firstName)
  const lastNameValue = useStore(form.store, (state) => state.values.lastName)
  const birthDateValue = useStore(form.store, (state) => state.values.birthDate)

  useEffect(() => {
    const firstName = firstNameValue.trim()
    const lastName = lastNameValue.trim()
    const timer = setTimeout(
      () =>
        setSearchParams(
          firstName || lastName
            ? {
                firstName: firstName || undefined,
                lastName: lastName || undefined,
                birthDate: birthDateValue || undefined,
              }
            : null,
        ),
      300,
    )
    return () => clearTimeout(timer)
  }, [firstNameValue, lastNameValue, birthDateValue])

  // Choisir une identité existante crée le sous-dossier dans le service courant, sans jamais
  // toucher à l'identité : ce chemin n'appelle jamais `createPatient` ni
  // `PATCH /patient/:id`. Le cas « déjà suivi ici » est dit par le toast de
  // `attachExistingPatient` (voir usePatientServiceFile.ts) ; la popup se ferme dans les deux
  // cas, comme pour la création.
  //
  // IRREVERSIBLE : choisir la
  // mauvaise ligne d'une liste d'homonymes cree un sous-dossier vide dans ce service qu'aucun
  // ecran, aucune route, ne permet de retirer ensuite — voir le commentaire de
  // `PatientServiceFileDomain.attachToCurrentService` (back). Rien ici ne le confirme avant
  // d'agir : garder ce risque present a l'esprit avant d'ajouter, un jour, une confirmation ou un
  // "annuler".
  const chooseExistingIdentity = async (match: PatientIdentityMatch) => {
    await attachExistingPatient.mutateAsync(match.id)
    setOpen(false)
    await goToPatient(match.id)
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

      <PopupContent
        size="lg"
        className={step === 2 ? 'w-[860px] max-w-[95vw]' : undefined}
      >
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
                  <form.AppField name="lastName">
                    {(field) => <field.Input label="Nom" className="w-full" />}
                  </form.AppField>

                  <form.AppField name="firstName">
                    {(field) => (
                      <field.Input label="Prénom" className="w-full" />
                    )}
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
                  {!identityMatches && (
                    <em className="text-sm text-neutral-400">
                      {identitySearch.isFetching
                        ? 'Recherche en cours…'
                        : "Saisissez un nom ou un prénom : les patients existants de l'établissement s'affichent ici."}
                    </em>
                  )}

                  {identityMatches && identityMatches.length === 0 && (
                    <em className="text-sm text-neutral-400">
                      Aucune identité existante trouvée dans l'établissement.
                    </em>
                  )}

                  {identityMatches && identityMatches.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {identityMatches.map((match) => (
                        <li
                          key={match.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <span>
                            {match.lastName} {match.firstName}
                            {match.birthDate && (
                              <span className="text-neutral-400">
                                {' '}
                                — né(e) le{' '}
                                {dayjs(match.birthDate).format('DD/MM/YYYY')}
                              </span>
                            )}
                            {match.inCurrentService === false && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                Autre service
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

                  {/* Troncature : la recherche existe
                      pour éviter les doublons — ne pas dire qu'il y a plus de résultats ferait
                      croire à tort qu'une identité n'existe pas. Jamais un total exact, voir
                      `PatientIdentitySearchResult`. */}
                  {identityMatches && identityMatchesHasMore && (
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
