import {
  Bookmark,
  LayoutTemplate,
  LoaderCircle,
  Route as RouteIcon,
  Save,
  User,
} from 'lucide-react'
import { useState } from 'react'

import type { MenuItem } from '../../../../constants/ui.constant.ts'
import { useAppForm } from '../../../../hooks/formConfig.tsx'
import { usePatientMutations } from '../../../../queries/usePatient.tsx'
import {
  usePatientServiceFileMutations,
  usePatientServiceFileQuery,
} from '../../../../queries/usePatientServiceFile.ts'
import type { Patient, UpdatePatientParams } from '../../../../types/patient.ts'
import type { UpdatePatientServiceFileFields } from '../../../../types/patientServiceFile.ts'
import { Button } from '../../../ui/button.tsx'
import { FixedBar } from '../../../ui/fixedbar.tsx'
import { ToggleGroup, ToggleGroupItem } from '../../../ui/toggle-group.tsx'
import { DetailsFields } from './details.patient.tsx'
import { patientFormOpts, patientServiceFileFormOpts } from './form.patient.ts'
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

  const {
    enrollmentIssues: _,
    id: __,
    followedElsewhere: ___,
    ...patientFormValues
  } = patient ?? {}

  const patientForm = useAppForm({
    ...patientFormOpts,
    defaultValues: {
      ...patientFormOpts.defaultValues,
      ...patientFormValues,
    },
    onSubmit: ({ value }) => {
      if (!patient?.id) {
        return
      }

      const updatePatientData = {
        id: patient.id,
        ...value,
      } satisfies UpdatePatientParams

      updatePatient.mutate(updatePatientData)
    },
  })

  const {
    id: _sfId,
    patientId: _sfPatientId,
    serviceId: _sfServiceId,
    establishmentId: _sfEstablishmentId,
    createdAt: _sfCreatedAt,
    ...serviceFileFormValues
  } = serviceFile ?? {}

  const serviceFileForm = useAppForm({
    ...patientServiceFileFormOpts,
    defaultValues: {
      ...patientServiceFileFormOpts.defaultValues,
      ...serviceFileFormValues,
    },
    onSubmit: ({ value, formApi }) => {
      if (!patient?.id || !serviceFileReady) {
        return
      }

      // Seuls les champs réellement modifiés depuis la lecture partent dans le corps du PATCH —
      // jamais un objet reconstruit à partir des défauts de `patientServiceFileFormOpts`.
      // `isDefaultValue` (pas `isDirty`, qui ne redevient jamais faux une fois un champ touché,
      // même reporté à sa valeur d'origine) reflète l'écart réel avec ce qui a été lu.
      const changedFields = (
        Object.keys(value) as (keyof typeof value)[]
      ).filter((field) => formApi.getFieldMeta(field)?.isDefaultValue === false)

      if (changedFields.length === 0) {
        return
      }

      const changedBody = Object.fromEntries(
        changedFields.map((field) => [field, value[field]]),
      ) as UpdatePatientServiceFileFields

      updatePatientServiceFile.mutate({
        patientID: patient.id,
        ...changedBody,
      })
    },
  })

  const isSaving = updatePatient.isPending || updatePatientServiceFile.isPending

  // Une seule action pour l'utilisateur, deux écritures indépendantes : chaque mutation a son
  // propre toast de succès/erreur (`usePatient.tsx`, `usePatientServiceFile.ts`), donc si l'une
  // échoue l'autre le dit distinctement — jamais un message générique qui laisserait croire que
  // tout a été enregistré. `serviceFileForm.handleSubmit()` n'est jamais appelé si la lecture du
  // sous-dossier n'a pas abouti.
  const handleSave = async () => {
    await patientForm.handleSubmit()
    if (serviceFileReady) {
      await serviceFileForm.handleSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
        <IdentiteFields form={patientForm} />
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
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    void handleSave()
                  }}
                >
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
    </div>
  )
}
