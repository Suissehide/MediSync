import { useEffect } from 'react'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { useForm } from '@tanstack/react-form'
import { combineDateAndTime } from '../../../libs/utils.ts'
import dayjs from 'dayjs'
import { Compact } from '@uiw/react-color'
import { DatePicker } from '../../ui/datePicker.tsx'
import { Checkbox, Input, Select, TextArea } from '../../ui/input.tsx'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import { TimePicker } from '../../ui/timePicker.tsx'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import type { CreateSlotParamsWithTemplateData } from '../../../types/slot.ts'
import { SLOT_LOCATION_OPTIONS } from '../../../constants/slot.constant.ts'

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
  const soignantOptions = soignants.map((soignant) => ({
    value: soignant.id,
    label: soignant.name,
  }))

  const today = dayjs()

  const form = useForm({
    defaultValues: {
      startDate: startDate ? dayjs(startDate) : today,
      startTime: startDate ? dayjs(startDate) : today,
      endTime: endDate ? dayjs(endDate) : today,
      thematic: '',
      identifier: '',
      location: '',
      description: '',
      soignant: '',
      color: color ?? '',
      isIndividual: false,
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
          thematic: value.thematic,
          identifier: value.identifier,
          location: value.location,
          description: value.description,
          soignantID: value.soignant,
          color: value.color,
          isIndividual: value.isIndividual,
        },
      }
      handleCreateSlot(newSlot)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

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

            <form.Field name="thematic">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Thématique</Label>
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

            <form.Field name="location">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Lieu</Label>
                  <Select
                    id={field.name}
                    options={SLOT_LOCATION_OPTIONS}
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value)}
                  />
                  <FieldInfo field={field} />
                </FormField>
              )}
            </form.Field>

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

            <form.Field name="isIndividual">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Individuel</Label>
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    onBlur={field.handleBlur}
                  />
                  <FieldInfo field={field} />
                </FormField>
              )}
            </form.Field>

            <div className="flex gap-4 items-center">
              <form.Field name="color">
                {(field) => (
                  <FormField>
                    <Label>Couleur</Label>
                    <Compact
                      className="bg-primary"
                      color={field.state.value}
                      onChange={(color) => field.handleChange(color.hex)}
                    />
                  </FormField>
                )}
              </form.Field>
            </div>

            <form.Field name="description">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Description</Label>
                  <TextArea
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldInfo field={field} />
                </FormField>
              )}
            </form.Field>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            Ajouter
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddSlotForm
