import { useForm } from '@tanstack/react-form'
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import type { CreatePatientParams } from '../../../types/patient.ts'
import { Button } from '../../ui/button.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import { MultiSelect } from '../../ui/multiSelect.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'

interface AddAppointmentFormProps {
  handleCreatePatient: (newPatient: CreatePatientParams) => void
}

function AddPatientForm({ handleCreatePatient }: AddAppointmentFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const { pathwayTemplates } = usePathwayTemplateQueries()

  const [selectedPathways, setSelectedPathways] = useState([] as string[])
  const pathwayOptions =
    pathwayTemplates?.map((pathwayTemplate) => ({
      value: pathwayTemplate.id,
      label: pathwayTemplate.name,
      color: pathwayTemplate.color,
    })) ?? []

  const handlePathwayChange = (val: string[]) => {
    setSelectedPathways(val)
    console.log('Selected pathways:', val)
  }

  const form = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: '',
      birthDate: '',
    },
    onSubmit: ({ value }) => {
      const newPatient: CreatePatientParams = {
        firstName: value.firstName,
        lastName: value.lastName,
        gender: value.gender,
        birthDate: value.birthDate,
      }
      handleCreatePatient(newPatient)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
      setStep(1)
    }
  }, [open, form])

  const nextStep = () => {
    // await form.validate()
    setStep((s) => s + 1)
  }

  const prevStep = () => setStep((s) => s - 1)

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Ajouter un patient
        </Button>
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
            {/* Étape 1 */}
            {step === 1 && (
              <>
                <div className="w-full flex gap-4">
                  <form.Field name="firstName">
                    {(field) => (
                      <FormField className="flex-1">
                        <Label htmlFor={field.name}>Prénom</Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                        <FieldInfo field={field} />
                      </FormField>
                    )}
                  </form.Field>

                  <form.Field name="lastName">
                    {(field) => (
                      <FormField className="flex-1">
                        <Label htmlFor={field.name}>Nom</Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        />
                        <FieldInfo field={field} />
                      </FormField>
                    )}
                  </form.Field>
                </div>

                <form.Field name="birthDate">
                  {(field) => (
                    <FormField className="fit-content">
                      <Label htmlFor={field.name}>Date de naissance</Label>
                      <Input
                        id={field.name}
                        type="date"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="gender">
                  {(field) => (
                    <FormField>
                      <Label htmlFor={field.name}>Genre</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <FieldInfo field={field} />
                    </FormField>
                  )}
                </form.Field>
              </>
            )}

            {/* Étape 2 */}
            {step === 2 && (
              <>
                <em className="text-sm text-neutral-400 mb-2">
                  Ajoutez des parcours et organisez-les par ordre de priorité
                </em>

                <div className="w-full flex gap-16">
                  <div className="flex-1">
                    <div className="flex gap-2 items-end">
                      <FormField>
                        <Label>Liste des parcours</Label>
                        <MultiSelect
                          options={pathwayOptions}
                          value={selectedPathways}
                          onChange={(val) => handlePathwayChange(val)}
                          placeholder={'Sélectionner un ou plusieurs parcours'}
                        />
                      </FormField>

                      <Button variant="default" size="default">
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1">
                    <ul className="space-y-2 text-sm">
                      <li className="rounded-md border border-border px-4 py-2">
                        Parcours 4
                      </li>
                      <li className="rounded-md border border-border px-4 py-2">
                        Parcours 3
                      </li>
                      <li className="rounded-md border border-border px-4 py-2">
                        Parcours 2
                      </li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </form>
        </PopupBody>

        <PopupFooter className="flex justify-between">
          <div className="flex gap-4">
            {step > 1 ? (
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="w-4 h-4" /> Précédent
              </Button>
            ) : null}

            {step < 2 ? (
              <Button variant="default" onClick={nextStep}>
                Suivant <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="default" onClick={() => form.handleSubmit()}>
                <Check className="w-4 h-4" /> Ajouter
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
