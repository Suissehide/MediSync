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
import { usePatientMutations } from '../../../../queries/usePatient.ts'
import type { Patient, UpdatePatientParams } from '../../../../types/patient.ts'
import { FixedBar } from '../../../ui/fixedbar.tsx'
import { ToggleGroup, ToggleGroupItem } from '../../../ui/toggle-group.tsx'
import { DetailsFields } from './details.patient.tsx'
import { patientFormOpts } from './form.patient.ts'
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
  const [selected, setSelected] = useState<string>('identity')

  const { enrollmentIssues: _, id: __, ...patientFormValues } = patient ?? {}

  const form = useAppForm({
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

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await form.validate('submit')
        await form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
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
        <IdentityFields form={form} />
      </Section>
      <Section show={selected === 'profile'}>
        <DetailsFields form={form} />
      </Section>
      <Section show={selected === 'pathway'}>
        <PathwayInclusionFields form={form} />
      </Section>
      <Section show={selected === 'outcome'}>
        <OutcomeReviewFields form={form} />
      </Section>

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => (
          <FixedBar
            open={isDirty}
            leftSlot={
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            }
            title="Modifications non sauvegardées"
            subtitle="Pensez à sauvegarder avant de changer d'onglet"
          >
            <form.AppForm>
              <form.SubmitButton label="Sauvegarder">
                {updatePatient.isPending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
              </form.SubmitButton>
            </form.AppForm>
          </FixedBar>
        )}
      </form.Subscribe>
    </form>
  )
}
