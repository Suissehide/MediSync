import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { GENDER_OPTIONS } from '../../../constants/patient.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { usePatientMutations } from '../../../queries/usePatient.ts'
import type { CreatePatientParams, TimeOfDay } from '../../../types/patient.ts'
import {
  PathwaySelector,
  usePathwaySelector,
  type PathwayPeriod,
} from '../pathwaySelector.tsx'
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

interface AddPatientFormProps {
  trigger?: React.ReactNode
}

function AddPatientForm({ trigger }: AddPatientFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const { enrollPatient } = usePatientMutations()
  const pathwayState = usePathwaySelector()

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: '',
      birthDate: '',
      startDate: dayjs(),
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
          pathwayTemplateID: p.pathwayTemplateId,
          timeOfDay: periodToTimeOfDay[p.period],
          thematic: p.thematic,
          type: p.type,
        })),
      })

      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
      setStep(1)
      pathwayState.reset()
    }
  }, [open, form, pathwayState.reset])

  const nextStep = () => setStep((s) => s + 1)
  const prevStep = () => setStep((s) => s - 1)

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="gradient"
            size="sm"
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
                    {(field) => <field.Input label="Prénom" />}
                  </form.AppField>

                  <form.AppField name="lastName">
                    {(field) => <field.Input label="Nom" />}
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

        <PopupFooter className="flex justify-between">
          <div className="flex gap-4">
            {step > 1 && (
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="w-4 h-4" /> Précédent
              </Button>
            )}

            {step < 2 ? (
              <Button variant="default" onClick={nextStep}>
                Suivant <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="default" onClick={() => form.handleSubmit()}>
                <Check className="w-4 h-4" /> Valider
              </Button>
            )}
          </div>

          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" /> Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddPatientForm
