import { useStore } from '@tanstack/react-form'
import dayjs from 'dayjs'
import { Check, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { combineDateAndTime } from '../../../libs/utils.ts'
import { useLocationQueries } from '../../../queries/useLocation.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import type { CreateSlotParamsWithTemplateData } from '../../../types/slot.ts'
import type { CreateSlotTemplateParams } from '../../../types/slotTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { MultiSelect } from '../../ui/select.tsx'
import { TimePicker } from '../../ui/timePicker.tsx'

interface AddSlotFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  startDate?: string
  endDate?: string
  color?: string
  handleCreateSlot: (
    newSlot: CreateSlotParamsWithTemplateData,
    recurrenceWeeks?: number,
  ) => void
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
  const { thematics } = useThematicQueries()
  const { locations } = useLocationQueries()
  const soignants = useSoignantStore((state) => state.soignants)
  const soignantOptions = useMemo(
    () =>
      [...soignants]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((soignant) => ({
          value: soignant.id,
          label: soignant.name,
        })),
    [soignants],
  )
  const locationOptions = useMemo(
    () =>
      [...(locations ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((l) => ({ value: l.id, label: l.name })),
    [locations],
  )

  const today = dayjs.utc()

  const form = useAppForm({
    defaultValues: {
      startDate: startDate ? dayjs.utc(startDate) : today,
      startTime: startDate ? dayjs.utc(startDate) : today,
      endTime: endDate ? dayjs.utc(endDate) : today,
      soignantIDs: [] as string[],
      thematicId: '',
      locationID: '',
      description: '',
      isIndividual: false,
      capacity: 1,
      color: color ?? '#2563eb',
      recurrence: false,
      recurrenceWeeks: 2,
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
          soignantIDs: value.soignantIDs,
          thematicId: value.thematicId,
          locationID: value.locationID || null,
          isIndividual: value.isIndividual,
          capacity: value.capacity,
          description: value.description,
          color: value.color,
        } satisfies CreateSlotTemplateParams,
      }
      handleCreateSlot(
        newSlot,
        value.recurrence ? value.recurrenceWeeks : undefined,
      )
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
  const isRecurrence = useStore(form.store, (state) => state.values.recurrence)
  const selectedSoignantIds = useStore(
    form.store,
    (state) => state.values.soignantIDs,
  )
  const selectedSoignants = soignants.filter((s) =>
    selectedSoignantIds.includes(s.id),
  )
  const thematicOptions = useMemo(() => {
    const set = new Map<string, { value: string; label: string }>()
    for (const soignant of selectedSoignants) {
      for (const t of
        thematics?.filter((t) =>
          t.soignants.some((ss) => ss.id === soignant.id),
        ) ?? []) {
        set.set(t.id, { value: t.id, label: t.name })
      }
    }
    return [...set.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'fr'),
    )
  }, [selectedSoignants, thematics])

  useEffect(() => {
    const current = form.state.values.thematicId
    if (current && !thematicOptions.some((o) => o.value === current)) {
      form.setFieldValue('thematicId', '')
    }
  }, [thematicOptions, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
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
                        onChange={(date) =>
                          field.handleChange(date ?? dayjs.utc())
                        }
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
                        onChange={(time) =>
                          field.handleChange(time ?? dayjs.utc())
                        }
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
                        onChange={(time) =>
                          field.handleChange(time ?? dayjs.utc())
                        }
                      />
                      <FieldInfo field={field} />
                    </div>
                  </FormField>
                )}
              </form.Field>
            </div>

            <div className="flex gap-2 items-center">
              <form.AppField name="recurrence">
                {(field) => (
                  <field.Toggle options={['Oui', 'Non']} label="Récurrence" />
                )}
              </form.AppField>

              {isRecurrence && (
                <form.AppField name="recurrenceWeeks">
                  {(field) => (
                    <field.Number
                      label="Nombre de semaines"
                      className="w-full"
                      min={2}
                      max={52}
                    />
                  )}
                </form.AppField>
              )}
            </div>

            <form.Field name="soignantIDs">
              {(field) => (
                <FormField>
                  <div className="text-sm text-text-light font-medium">Soignants</div>
                  <MultiSelect
                    options={soignantOptions}
                    value={field.state.value}
                    onChange={(values) => field.handleChange(values)}
                    placeholder="Sélectionnez un ou plusieurs soignants"
                  />
                  <FieldInfo field={field} />
                </FormField>
              )}
            </form.Field>

            <form.AppField name="thematicId">
              {(field) => (
                <field.Select
                  options={thematicOptions}
                  label="Thématique"
                  disabled={
                    selectedSoignants.length === 0 || thematicOptions.length === 0
                  }
                  placeholder={
                    selectedSoignants.length === 0
                      ? 'Sélectionnez un soignant'
                      : thematicOptions.length === 0
                        ? 'Aucune thématique associée'
                        : 'Sélectionnez une thématique'
                  }
                />
              )}
            </form.AppField>

            <form.AppField name="locationID">
              {(field) => (
                <field.Select options={locationOptions} label="Lieu" />
              )}
            </form.AppField>

            <div className="flex gap-2 items-center">
              <form.AppField name="isIndividual">
                {(field) => (
                  <field.Toggle
                    options={['Individuel', 'Multiple']}
                    label="Type"
                  />
                )}
              </form.AppField>

              {!isIndividual && (
                <form.AppField name="capacity">
                  {(field) => (
                    <field.Number label="Capacité maximum" className="w-full" />
                  )}
                </form.AppField>
              )}
            </div>

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
