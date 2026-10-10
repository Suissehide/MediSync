import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Undo2,
  X,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { SERVICE_FIELD_TYPE_LABELS } from '../../../constants/serviceFieldTypes.tsx'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useServiceFieldMutations } from '../../../queries/useServiceField.ts'
import type {
  ServiceField,
  ServiceFieldSection,
  ServiceFieldType,
} from '../../../types/serviceField.ts'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'
import { TagInput } from '../../ui/tagInput.tsx'

const TYPE_OPTIONS = Object.entries(SERVICE_FIELD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
)

// Les deux seuls types qui portent des choix.
const CHOICE_TYPES: ServiceFieldType[] = ['choice', 'multichoice']

interface ServiceFieldFormProps {
  section: ServiceFieldSection
  field?: ServiceField
  trigger?: React.ReactNode
}

function ServiceFieldForm({ section, field, trigger }: ServiceFieldFormProps) {
  const [open, setOpen] = useState(false)
  const [newChoiceLabel, setNewChoiceLabel] = useState('')
  const { create, update, createChoice, updateChoice, reorderChoices } =
    useServiceFieldMutations()

  const defaultValues = useMemo(
    () => ({
      label: field?.label ?? '',
      type: field?.type ?? ('text' as ServiceFieldType),
      unit: field?.unit ?? '',
      clinical: field?.clinical ?? false,
      choices: [] as string[],
    }),
    [field?.label, field?.type, field?.unit, field?.clinical],
  )

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value }) => {
      if (field) {
        update.mutate({
          id: field.id,
          label: value.label,
          ...(value.type === 'number' ? { unit: value.unit || null } : {}),
        })
      } else {
        create.mutate({
          label: value.label,
          type: value.type,
          section,
          clinical: value.clinical,
          ...(value.type === 'number' && value.unit
            ? { unit: value.unit }
            : {}),
          ...(CHOICE_TYPES.includes(value.type)
            ? { choices: value.choices }
            : {}),
        })
      }
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      setNewChoiceLabel('')
    }
  }, [open, defaultValues, form])

  const moveChoice = (direction: 'up' | 'down', index: number) => {
    if (!field) {
      return
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= field.choices.length) {
      return
    }
    const ids = field.choices.map((c) => c.id)
    ;[ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]]
    reorderChoices.mutate({ fieldID: field.id, ids })
  }

  const ajouterChoix = () => {
    if (!field || !newChoiceLabel.trim()) {
      return
    }
    createChoice.mutate({ fieldID: field.id, label: newChoiceLabel.trim() })
    setNewChoiceLabel('')
  }

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ??
          (field ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Pencil className="w-4 h-4" />
              Modifier
            </Button>
          ) : (
            <Button variant="default" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" />
              Ajouter un champ
            </Button>
          ))}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {field ? 'Modifier le champ' : 'Ajouter un champ'}
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <form.AppField
              name="label"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le libellé est nécessaire',
              }}
            >
              {(f) => <f.Input label="Libellé" />}
            </form.AppField>

            <form.AppField name="type">
              {(f) => (
                <f.Select
                  label="Type"
                  options={TYPE_OPTIONS}
                  disabled={!!field}
                  clearable={false}
                />
              )}
            </form.AppField>

            <form.Subscribe selector={(state) => state.values.type}>
              {(type) =>
                type === 'number' ? (
                  <form.AppField name="unit">
                    {(f) => <f.Input label="Unité" />}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>

            <form.AppField name="clinical">
              {(f) => (
                <f.Checkbox
                  label="Clinique"
                  disabled={!!field}
                  description="Masqué au secrétariat et à la lecture seule"
                />
              )}
            </form.AppField>

            {!field && (
              <form.Subscribe selector={(state) => state.values.type}>
                {(type) =>
                  CHOICE_TYPES.includes(type) ? (
                    <form.AppField name="choices">
                      {(f) => (
                        <div className="flex flex-col gap-1">
                          <Label>Choix</Label>
                          <TagInput
                            value={f.state.value}
                            onChange={f.handleChange}
                            placeholder="Ajouter un choix..."
                          />
                        </div>
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>
            )}

            {field && CHOICE_TYPES.includes(field.type) && (
              <div className="flex flex-col gap-2">
                <Label>Choix</Label>
                <ul className="flex flex-col gap-1">
                  {field.choices.map((choice, index) => (
                    <li key={choice.id} className="flex items-center gap-2">
                      <Input
                        defaultValue={choice.label}
                        className="flex-1"
                        onBlur={(e) => {
                          if (e.target.value !== choice.label) {
                            updateChoice.mutate({
                              fieldID: field.id,
                              choiceID: choice.id,
                              label: e.target.value,
                            })
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Monter"
                        disabled={index === 0}
                        onClick={() => moveChoice('up', index)}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Descendre"
                        disabled={index === field.choices.length - 1}
                        onClick={() => moveChoice('down', index)}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      {choice.archived ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateChoice.mutate({
                              fieldID: field.id,
                              choiceID: choice.id,
                              archived: false,
                            })
                          }
                        >
                          <Undo2 className="w-4 h-4" />
                          Restaurer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateChoice.mutate({
                              fieldID: field.id,
                              choiceID: choice.id,
                              archived: true,
                            })
                          }
                        >
                          <Archive className="w-4 h-4" />
                          Archiver
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <Input
                    value={newChoiceLabel}
                    onChange={(e) => setNewChoiceLabel(e.target.value)}
                    placeholder="Nouveau choix"
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={ajouterChoix}>
                    <Plus className="w-4 h-4" />
                    Ajouter un choix
                  </Button>
                </div>
              </div>
            )}
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            isLoading={field ? update.isPending : create.isPending}
            onClick={() => form.handleSubmit()}
          >
            <Check className="w-4 h-4" />
            {field ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default ServiceFieldForm
