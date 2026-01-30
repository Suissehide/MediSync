import { useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'
import {
  ArrowRightFromLine,
  Bookmark,
  ChevronRight,
  LayoutTemplate,
  LoaderCircle,
  Route as RouteIcon,
  Save,
  User,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { useAppForm } from '../../../../hooks/formConfig.tsx'
import { usePatientMutations } from '../../../../queries/usePatient.ts'
import type { MenuItem } from '../../../../routes/_authenticated/patient/$patientID.tsx'
import type { Patient, UpdatePatientParams } from '../../../../types/patient.ts'
import { Button } from '../../../ui/button.tsx'
import { DetailsFields } from './details.patient.tsx'
import { patientFormOpts } from './form.patient.ts'
import { IdentityFields } from './identity.patient.tsx'
import { OutcomeReviewFields } from './outcome-review.patient.tsx'
import { PathwayInclusionFields } from './pathway-inclusion.patient.tsx'

type PatientParam = {
  patient?: Patient
  setEditMode: (mode: boolean) => void
}

const Section = ({
  show,
  children,
}: {
  show: boolean
  children: React.ReactNode
}) => (
  <div className={`flex-col gap-4 ${show ? 'flex' : 'hidden'}`}>{children}</div>
)

export default function EditPatient({ patient, setEditMode }: PatientParam) {
  const navigate = useNavigate()
  const { updatePatient } = usePatientMutations()

  const [selected, setSelected] = useState<string>('overview')
  const menuItems: MenuItem[] = [
    {
      id: 'overview',
      label: 'Informations générales',
      icon: LayoutTemplate,
    },
    {
      id: 'profile',
      label: 'Profil & Contexte',
      icon: User,
    },
    {
      id: 'pathway',
      label: 'Parcours & Inclusion',
      icon: RouteIcon,
    },
    {
      id: 'outcome',
      label: 'Sortie & Bilan',
      icon: Bookmark,
    },
  ]

  const form = useAppForm({
    ...patientFormOpts,
    defaultValues: {
      ...patientFormOpts.defaultValues,
      ...patient,
    },
    onSubmit: ({ value }) => {
      if (!patient?.id) {
        return
      }

      const updatePatientData = {
        id: patient.id,
        ...value,
      } satisfies UpdatePatientParams

      console.log('Updating patient:', updatePatientData)

      updatePatient.mutate(updatePatientData)
      setEditMode(false)
    },
  })

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await form.validate('submit')
        await form.handleSubmit()
      }}
      className="w-full py-4 px-4 flex flex-col gap-4"
    >
      <div className="flex gap-2 items-center text-sm">
        <ArrowRightFromLine size={18} className="font-bold" />
        <button
          type="button"
          className="cursor-pointer text-text-light transition duration-300 hover:underline"
          onClick={() => navigate({ to: '/patient' })}
        >
          Patients
        </button>
        <div className="text-text-light italic text-xs">/</div>
        <div>
          {patient?.firstName} {patient?.lastName}
        </div>
      </div>

      <div className="h-full flex gap-4">
        <div className="h-fit w-[400px] border border-border rounded-lg sticky top-4 self-start">
          <div className="px-4 py-4 flex justify-between items-center">
            <Button
              variant="outline"
              size="default"
              onClick={() => setEditMode(false)}
            >
              <X size={16} />
              Annuler
            </Button>
          </div>

          <div className="w-full border-t border-border" />
          <div className="flex flex-col gap-4 px-4 py-4">
            <h3 className="mt-2 text-2xl font-semibold">
              Modification du patient
            </h3>
            <form.AppForm>
              <form.SubmitButton label="Sauvegarder">
                {updatePatient.isPending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
              </form.SubmitButton>
            </form.AppForm>
          </div>

          <div className="w-full border-t border-border" />
          <div className="px-4 py-4">
            <ul>
              {menuItems.map(({ id, label, icon: Icon }) => {
                const isActive = selected === id
                return (
                  <li
                    key={id}
                    onClick={() => setSelected(id)}
                    onKeyDown={() => setSelected(id)}
                    className={`group cursor-pointer px-3 py-2 flex justify-between items-center rounded transition duration-300 ${
                      isActive
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'text-text hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    <div className="flex gap-2 items-center">
                      <Icon
                        className={`h-4 w-4 group-hover:text-primary ${isActive ? 'text-primary' : 'text-text'}`}
                      />
                      {label}
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 transition ${
                        isActive ? 'text-primary' : 'group-hover:text-primary'
                      }`}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div
          className={clsx(
            'flex-1 flex flex-col gap-4',
            selected !== 'planning' && 'h-fit max-w-xl',
          )}
        >
          <Section show={selected === 'overview'}>
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
        </div>
      </div>
    </form>
  )
}
