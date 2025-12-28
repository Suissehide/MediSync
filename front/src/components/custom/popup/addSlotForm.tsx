import { useStore } from '@tanstack/react-form'
import dayjs from 'dayjs'
import { Check, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'

import {
  getThemeOptionsByRole,
  SLOT_DURATION_OPTIONS,
  SLOT_LOCATION_OPTIONS,
  THEMATICS,
} from '../../../constants/slot.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { combineDateAndTime } from '../../../libs/utils.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import type { CreateSlotParamsWithTemplateData } from '../../../types/slot.ts'
import type { CreateSlotTemplateParams } from '../../../types/slotTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Select } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { TimePicker } from '../../ui/timePicker.tsx'

interface AddSlotFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  startDate?: string
  endDate?: string
  color?: string
  handleCreateSlot: (newSlot: CreateSlotParamsWithTemplateData) => void
}

function AddSlotForm({
  open,
  setOpen,
  startDate,
  endDate,
  color,
  handleCreateSlot,
}: AddSlotFormProps) {
  useSoignantQueries()
  const soignants = useSoignantStore((state) => state.soignants)
  const soignantOptions = useMemo(
    () =>
      soignants.map((soignant) => ({
        value: soignant.id,
        label: soignant.name,
      })),
    [soignants],
  )

  const today = dayjs()

  const form = useAppForm({
    defaultValues: {
      startDate: startDate ? dayjs(startDate) : today,
      startTime: startDate ? dayjs(startDate) : today,
      endTime: endDate ? dayjs(endDate) : today,
      soignant: '',
      thematic: '',
      location: '',
      description: '',
      isIndividual: false,
      duration: 15,
      capacity: 1,
      color: color ?? '#2563eb',
    },

    onSubmit: ({ value }) => {
      const startDate = combineDateAndTime(
        value.startDate.toISOString(),
        value.startTime.toISOString(),
      ).toISOString()
      const endDate = combineDateAndTime(
        value.startDate.toISOString(),
        value.endTime.toISOString(),
      ).toISOString()

      const newSlot = {
        startDate,
        endDate,
        slotTemplate: {
          startTime: startDate,
          endTime: endDate,
          offsetDays: 0,
          soignantID: value.soignant,
          thematic: value.thematic,
          location: value.location,
          isIndividual: value.isIndividual,
          duration: value.duration,
          capacity: value.capacity,
          description: value.description,
          color: value.color,
        } satisfies CreateSlotTemplateParams,
      }
      handleCreateSlot(newSlot)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  const isIndividual = useStore(
    form.store,
    (state) => state.values.isIndividual,
  )
  const selectedSoignantId = useStore(
    form.store,
    (state) => state.values.soignant,
  )
  const selectedSoignant = soignants.find((s) => s.id === selectedSoignantId)
  const thematicOptions = selectedSoignant
    ? getThemeOptionsByRole(THEMATICS, selectedSoignant.name)
    : []

  useEffect(() => {
    if (selectedSoignantId) {
      form.setFieldValue('thematic', '')
    }
  }, [selectedSoignantId, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Ajouter un créneau
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="flex flex-col gap-2 max-w-md"
          >
            <div className="flex flex-wrap gap-2 items-center">
              <form.Field
                name="startDate"
                validators={{
                  onSubmit: ({ value }) => {
                    if (!value) {
                      return 'Ce champ est requis'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => (
                  <FormField className="flex items-center gap-2">
                    <div className="text-sm text-text-light font-medium">
                      Le
                    </div>
                    <div>
                      <DatePicker
                        value={field.state.value}
                        onChange={(date) => field.handleChange(date ?? dayjs())}
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>

              <form.Field name="startTime">
                {(field) => (
                  <FormField className="flex items-center gap-2">
                    <div className="text-sm text-text-light font-medium">
                      de
                    </div>
                    <div>
                      <TimePicker
                        value={field.state.value}
                        onChange={(time) => field.handleChange(time ?? dayjs())}
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>

              <form.Field name="endTime">
                {(field) => (
                  <FormField className="flex items-center gap-2">
                    <div className="text-sm text-text-light font-medium">à</div>
                    <div>
                      <TimePicker
                        value={field.state.value}
                        onChange={(time) => field.handleChange(time ?? dayjs())}
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>
            </div>

            <form.Field
              name="soignant"
              validators={{
                onSubmit: ({ value }) => {
                  if (!value) {
                    return 'Ce champ est requis'
                  }
                  return undefined
                },
              }}
            >
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Soignant</Label>
                  <Select
                    id={field.name}
                    options={soignantOptions}
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value)}
                  />
                  <FieldInfo field={field} />
                </FormField>
              )}
            </form.Field>

            <form.AppField name="thematic">
              {(field) => (
                <field.Select
                  options={thematicOptions}
                  label="Thématique"
                  disabled={!selectedSoignant}
                />
              )}
            </form.AppField>

            <form.AppField name="location">
              {(field) => (
                <field.Select options={SLOT_LOCATION_OPTIONS} label="Lieu" />
              )}
            </form.AppField>

            <form.AppField name="isIndividual">
              {(field) => (
                <field.Toggle
                  options={['Individuel', 'Multiple']}
                  label="Type"
                />
              )}
            </form.AppField>

            {isIndividual ? (
              <form.AppField name="duration">
                {(field) => (
                  <field.Select
                    options={SLOT_DURATION_OPTIONS}
                    label="Durée par défaut"
                  />
                )}
              </form.AppField>
            ) : (
              <form.AppField name="capacity">
                {(field) => <field.Number label="Capacité maximum" />}
              </form.AppField>
            )}

            <div className="flex gap-4 items-center">
              <form.AppField name="color">
                {(field) => <field.ColorPicker label="Couleur" />}
              </form.AppField>
            </div>

            <form.AppField name="description">
              {(field) => <field.TextArea label="Description" />}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddSlotForm
