import { useForm } from '@tanstack/react-form'
import { Compact } from '@uiw/react-color'
import dayjs from 'dayjs'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { formatDuration } from '../../../../libs/utils.ts'
import {
  useSlotByIDQuery,
  useSlotMutations,
} from '../../../../queries/useSlot.ts'
import { useSoignantQueries } from '../../../../queries/useSoignant.ts'
import { useSoignantStore } from '../../../../store/useSoignantStore.ts'
import { Button } from '../../../ui/button.tsx'
import { FieldInfo } from '../../../ui/fieldInfo.tsx'
import { FormField } from '../../../ui/formField.tsx'
import { Checkbox, Input, Select, TextArea } from '../../../ui/input.tsx'
import { Label } from '../../../ui/label.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../../ui/sheet.tsx'

interface EventSheetProps {
  open: boolean
  setOpen: (openEventId: string) => void
  eventID: string
  handleDeleteEvent?: (eventID: string) => void
}

export default function EventSheet({
  open,
  setOpen,
  eventID,
  handleDeleteEvent,
}: EventSheetProps) {
  const { isPending, slot, refetch } = useSlotByIDQuery(eventID, {
    enabled: false,
  })
  const { updateSlot } = useSlotMutations()

  useSoignantQueries()
  const soignants = useSoignantStore((state) => state.soignants)
  const soignantOptions = soignants.map((soignant) => ({
    value: soignant.id,
    label: soignant.name,
  }))

  const form = useForm({
    defaultValues: {
      thematic: '',
      location: '',
      description: '',
      isIndividual: false,
      soignant: '',
      color: '',
    },
    onSubmit: ({ value }) => {
      if (!slot?.id) {
        return
      }

      const updatedSlotData = {
        id: slot.id,
        slotTemplate: {
          id: slot.slotTemplate.id,
          thematic: value.thematic,
          location: value.location,
          description: value.description,
          isIndividual: value.isIndividual,
          soignantID: value.soignant,
          color: value.color,
        },
      }

      updateSlot.mutate(updatedSlotData)
      setOpen('')
    },
  })

  const handleDelete = () => {
    if (slot) {
      handleDeleteEvent?.(slot.id)
      setOpen('')
    }
  }

  useEffect(() => {
    if (open) {
      refetch().then(({ data }) => {
        if (data) {
          form.reset(
            {
              thematic: data.slotTemplate.thematic || '',
              location: data.slotTemplate.location || '',
              description: data.slotTemplate.description || '',
              isIndividual: data.slotTemplate.isIndividual || false,
              soignant: data.slotTemplate.soignant?.id || '',
              color: data.slotTemplate.color || '',
            },
            { keepDefaultValues: true },
          )
        }
      })
    }
  }, [open, form, refetch])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? eventID : '')}
    >
      <SheetContent>
        <SheetHeader className="flex flex-row justify-between items-center mb-6">
          <div className="m-0">
            <SheetTitle className="font-bold text-2xl m-0!">Créneau</SheetTitle>
          </div>
        </SheetHeader>

        <div className="h-full">
          {isPending ? (
            <div className="h-full flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await form.validate('submit')
                  await form.handleSubmit()
                }}
                className="flex flex-col gap-2 max-w-md"
              >
                <div className="flex">
                  {`Le ${dayjs(slot?.startDate).format('dddd D MMMM à hh:mm')} ${formatDuration(slot?.startDate, slot?.endDate)}`}
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
                  {(field) => {
                    return (
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
                    )
                  }}
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

              <div className="flex justify-between gap-4 mt-4">
                <div>
                  <Button variant="destructive" onClick={() => handleDelete()}>
                    Supprimer
                  </Button>
                </div>
                <div className="flex gap-4">
                  <Button variant="default" onClick={() => form.handleSubmit()}>
                    Mettre à jour
                  </Button>
                  <Button variant="outline" onClick={() => setOpen('')}>
                    Annuler
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
