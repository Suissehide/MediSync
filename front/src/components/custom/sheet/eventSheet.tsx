import dayjs from 'dayjs'
import { FilePlus, Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { formatDuration } from '../../../libs/utils.ts'
import { useSlotByIDQuery, useSlotMutations } from '../../../queries/useSlot.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import type { UpdateSlotParams } from '../../../types/slot.ts'
import { Button } from '../../ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet.tsx'
import { EventFormFields } from './form/EventFormFields.tsx'
import { eventFormOpts } from './form/eventFormOpts.ts'

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

  const form = useAppForm({
    ...eventFormOpts,
    defaultValues: {
      soignant: slot?.slotTemplate.soignant?.id ?? '',
      thematic: slot?.slotTemplate.thematic ?? '',
      location: slot?.slotTemplate.location ?? '',
      isIndividual: slot?.slotTemplate.isIndividual ?? false,
      capacity: slot?.slotTemplate.capacity ?? 1,
      duration: slot?.slotTemplate.duration ?? 15,
      color: slot?.slotTemplate.color ?? '',
      description: slot?.slotTemplate.description ?? '',
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
          capacity: Number(value.capacity),
          duration: Number(value.duration),
          soignantID: value.soignant,
          color: value.color,
        },
      } satisfies UpdateSlotParams

      updateSlot.mutate(updatedSlotData, {
        onSuccess: () => {
          setOpen('')
        },
      })
    },
  })

  const handleDelete = () => {
    if (slot) {
      handleDeleteEvent?.(slot.id)
      setOpen('')
    }
  }

  const { reset } = form

  useEffect(() => {
    if (open) {
      void refetch()
    }
  }, [open, refetch])

  useEffect(() => {
    if (!slot || !open) {
      return
    }

    reset(
      {
        soignant: slot.slotTemplate.soignant?.id ?? '',
        thematic: slot.slotTemplate.thematic ?? '',
        location: slot.slotTemplate.location ?? '',
        isIndividual: slot.slotTemplate.isIndividual ?? false,
        capacity: slot.slotTemplate.capacity ?? 1,
        duration: slot.slotTemplate.duration ?? 15,
        description: slot.slotTemplate.description ?? '',
        color: slot.slotTemplate.color ?? '',
      },
      { keepDefaultValues: true },
    )
  }, [slot, open, reset])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? eventID : '')}
    >
      <SheetContent className="flex flex-col h-full">
        <SheetHeader className="flex flex-row justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="pl-2 relative flex justify-center items-center before:z-[-1] before:absolute before:bg-primary/30 before:rounded-full before:w-6.5 before:h-6.5 after:z-[-1] after:absolute after:bg-primary/10 after:rounded-full after:w-9.5 after:h-9.5">
              <FilePlus
                fill="#2563eb"
                strokeWidth={1}
                className="h-4 w-4 text-card z-1"
              />
            </div>
            <div>
              <SheetTitle className="mb-[-4px]">Créneau</SheetTitle>
              <div className="text-sm text-text-light">
                {`${dayjs(slot?.startDate)
                  .format('dddd D MMMM [de] hh:mm')
                  .replace(/^./, (c) => c.toUpperCase())}
                    ${dayjs(slot?.endDate).format('[à] hh:mm')}
                    ${formatDuration(slot?.startDate, slot?.endDate)}`}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {isPending ? (
            <div className="flex-1 flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await form.handleSubmit()
                }}
                className="w-full flex-1 flex flex-col min-h-0 gap-2 px-4"
              >
                <EventFormFields form={form} />
              </form>

              <div className="w-full border-t border-border"></div>

              <div className="px-4 py-4 flex justify-between gap-4 shrink-0">
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
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
