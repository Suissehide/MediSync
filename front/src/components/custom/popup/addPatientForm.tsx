import { useForm } from '@tanstack/react-form'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../../constants/appointment.constant.ts'
import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import type { CreatePatientParams } from '../../../types/patient.ts'
import { Button } from '../../ui/button.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Input, Select } from '../../ui/input.tsx'
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

type PathwayPeriod = 'morning' | 'afternoon' | 'fullday'

interface AddedPathway {
  id: string
  pathwayTemplateId: string
  name: string
  color: string
  period: PathwayPeriod
  thematic: string
  type: string
}

function AddPatientForm({ handleCreatePatient }: AddAppointmentFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const { pathwayTemplates } = usePathwayTemplateQueries()

  const [selectedPathways, setSelectedPathways] = useState([] as string[])
  const [addedPathways, setAddedPathways] = useState<AddedPathway[]>([])
  const [expandedPathwayId, setExpandedPathwayId] = useState<string | null>(
    null,
  )
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const pathwayOptions =
    pathwayTemplates?.map((pathwayTemplate) => ({
      value: pathwayTemplate.id,
      label: pathwayTemplate.name,
      color: pathwayTemplate.color,
    })) ?? []

  const handlePathwayChange = (val: string[]) => {
    setSelectedPathways(val)
  }

  const handleAddPathways = () => {
    const newPathways = selectedPathways
      .filter((id) => !addedPathways.some((p) => p.pathwayTemplateId === id))
      .map((id) => {
        const template = pathwayTemplates?.find((pt) => pt.id === id)
        console.log(template)
        return {
          id: `${id}-${Date.now()}`,
          pathwayTemplateId: id,
          name: template?.name || '',
          color: template?.color || '#000000',
          period: 'fullday' as PathwayPeriod,
          thematic: 'Thématique A',
          type: 'Type 1',
        }
      })
    setAddedPathways([...addedPathways, ...newPathways])
    setSelectedPathways([])
  }

  const toggleExpand = (pathwayId: string) => {
    setExpandedPathwayId(expandedPathwayId === pathwayId ? null : pathwayId)
  }

  const updatePathway = (id: string, updates: Partial<AddedPathway>) => {
    setAddedPathways(
      addedPathways.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    )
  }

  const handleRemovePathway = (id: string) => {
    setAddedPathways(addedPathways.filter((p) => p.id !== id))
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) {
      return
    }

    const newPathways = [...addedPathways]
    const draggedItem = newPathways[draggedIndex]
    newPathways.splice(draggedIndex, 1)
    newPathways.splice(index, 0, draggedItem)

    setAddedPathways(newPathways)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
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

      console.log('Submitting patient:', value, addedPathways)
      // handleCreatePatient(newPatient)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
      setStep(1)
      setAddedPathways([])
      setSelectedPathways([])
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

                <div className="w-full flex flex-col gap-4">
                  <div className="flex-1">
                    <div className="flex gap-2 items-end">
                      <FormField className="flex-1">
                        <Label>Liste des parcours</Label>
                        <MultiSelect
                          options={pathwayOptions}
                          value={selectedPathways}
                          onChange={(val) => handlePathwayChange(val)}
                          placeholder={'Sélectionner un ou plusieurs parcours'}
                        />
                      </FormField>

                      <Button
                        variant="default"
                        size="default"
                        type="button"
                        onClick={handleAddPathways}
                        disabled={selectedPathways.length === 0}
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1">
                    <Label className="mb-2 block">
                      Parcours ajoutés ({addedPathways.length})
                    </Label>
                    {addedPathways.length === 0 ? (
                      <div className="text-sm text-neutral-400 text-center py-8 border border-dashed border-border rounded-md">
                        Aucun parcours ajouté
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {addedPathways.map((pathway, index) => {
                          const isExpanded = expandedPathwayId === pathway.id
                          return (
                            <li
                              key={pathway.id}
                              draggable
                              onDragStart={() => handleDragStart(index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragEnd={handleDragEnd}
                              className={`rounded-md border border-border bg-white transition-all ${
                                draggedIndex === index
                                  ? 'opacity-50'
                                  : 'opacity-100'
                              }`}
                              style={{
                                borderLeftColor: pathway.color,
                                borderLeftWidth: '4px',
                              }}
                            >
                              <div className="flex items-center gap-2 px-3 py-2 cursor-move">
                                <GripVertical className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {pathway.name}
                                  </div>
                                  <div className="text-xs text-neutral-500 flex gap-2 flex-wrap mt-0.5">
                                    <span>
                                      {pathway.period === 'morning'
                                        ? 'Matin'
                                        : pathway.period === 'afternoon'
                                          ? 'Après-midi'
                                          : 'Journée complète'}
                                    </span>
                                    <span>•</span>
                                    <span>{pathway.thematic}</span>
                                    <span>•</span>
                                    <span>{pathway.type}</span>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExpand(pathway.id)}
                                  className="flex-shrink-0"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleRemovePathway(pathway.id)
                                  }
                                  className="flex-shrink-0 text-red-500 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>

                              {isExpanded && (
                                <div className="px-3 pb-3 pt-2 border-t border-border bg-neutral-50">
                                  <div
                                    className="mb-2 h-2 rounded-full"
                                    style={{ backgroundColor: pathway.color }}
                                  />

                                  <FormField>
                                    <Label>Période</Label>
                                    <div>
                                      {[
                                        {
                                          value: 'morning' as PathwayPeriod,
                                          label: 'Matin',
                                        },
                                        {
                                          value: 'afternoon' as PathwayPeriod,
                                          label: 'Après-midi',
                                        },
                                        {
                                          value: 'fullday' as PathwayPeriod,
                                          label: 'Journée complète',
                                        },
                                      ].map((option) => (
                                        <label
                                          key={option.value}
                                          className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 p-2 rounded"
                                        >
                                          <input
                                            type="radio"
                                            name={`period-${pathway.id}`}
                                            value={option.value}
                                            checked={
                                              pathway.period === option.value
                                            }
                                            onChange={(e) =>
                                              updatePathway(pathway.id, {
                                                period: e.target
                                                  .value as PathwayPeriod,
                                              })
                                            }
                                            className="w-4 h-4"
                                          />
                                          <span className="text-sm">
                                            {option.label}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </FormField>

                                  <FormField>
                                    <Label htmlFor={`thematic-${pathway.id}`}>
                                      Thématique
                                    </Label>
                                    <Select
                                      id={`thematic-${pathway.id}`}
                                      value={pathway.thematic}
                                      options={[]}
                                      onValueChange={(value) =>
                                        updatePathway(pathway.id, {
                                          thematic: value,
                                        })
                                      }
                                    />
                                  </FormField>

                                  <FormField>
                                    <Label htmlFor={`type-${pathway.id}`}>
                                      Type
                                    </Label>
                                    <Select
                                      id={`type-${pathway.id}`}
                                      value={pathway.type}
                                      options={APPOINTMENT_TYPE_OPTIONS}
                                      onValueChange={(value) =>
                                        updatePathway(pathway.id, {
                                          type: value,
                                        })
                                      }
                                    />
                                  </FormField>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
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
