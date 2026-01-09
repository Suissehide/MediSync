import dayjs from 'dayjs'
import { FilePlus, Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { formatDuration } from '../../../libs/utils.ts'
import {
  useSlotTemplateByIDQuery,
  useSlotTemplateMutations,
} from '../../../queries/useSlotTemplate.ts'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import type { UpdateSlotTemplateParams } from '../../../types/slotTemplate.ts'
import { Button } from '../../ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet.tsx'
import { EventFormFields } from './form/EventFormFields.tsx'
import { eventFormOpts } from './form/eventFormOpts.ts'

interface EventTemplateSheetProps {
  open: boolean
  setOpen: (openEventId: string) => void
  eventTemplateID: string
  handleDeleteEvent?: (eventTemplateID: string) => void
}

export default function EventTemplateSheet({
  open,
  setOpen,
  eventTemplateID,
  handleDeleteEvent,
}: EventTemplateSheetProps) {
  const { isPending, slotTemplate, refetch } = useSlotTemplateByIDQuery(
    eventTemplateID,
    { enabled: false },
  )
  const { updateSlotTemplate } = useSlotTemplateMutations()

  useSoignantQueries()

  const form = useAppForm({
    ...eventFormOpts,
    defaultValues: {
      thematic: slotTemplate?.thematic ?? '',
      location: slotTemplate?.location ?? '',
      description: slotTemplate?.description ?? '',
      isIndividual: slotTemplate?.isIndividual ?? false,
      capacity: slotTemplate?.capacity ?? 1,
      duration: slotTemplate?.duration ?? 15,
      soignant: slotTemplate?.soignant?.id ?? '',
      color: slotTemplate?.color ?? '',
    },
    onSubmit: ({ value }) => {
      if (!slotTemplate?.id) {
        return
      }

      const updatedSlotTemplateData = {
        id: slotTemplate.id,
        thematic: value.thematic,
        location: value.location,
        description: value.description,
        isIndividual: value.isIndividual,
        capacity: value.capacity ?? 1,
        duration: value.duration ?? 15,
        soignantID: value.soignant,
        color: value.color,
      } satisfies UpdateSlotTemplateParams

      updateSlotTemplate.mutate(updatedSlotTemplateData)
      setOpen('')
    },
  })

  const { reset } = form

  const handleDelete = () => {
    if (slotTemplate) {
      handleDeleteEvent?.(slotTemplate.id)
      setOpen('')
    }
  }

  useEffect(() => {
    if (open) {
      void refetch()
    }
  }, [open, refetch])

  useEffect(() => {
    if (!slotTemplate || !open) {
      return
    }

    reset(
      {
        thematic: slotTemplate.thematic ?? '',
        location: slotTemplate.location ?? '',
        description: slotTemplate.description ?? '',
        isIndividual: slotTemplate.isIndividual ?? false,
        capacity: slotTemplate.capacity ?? 1,
        duration: slotTemplate.duration ?? 15,
        soignant: slotTemplate.soignant?.id ?? '',
        color: slotTemplate.color ?? '',
      },
      { keepDefaultValues: true },
    )
  }, [slotTemplate, open, reset])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? eventTemplateID : '')}
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
              <SheetTitle className="mb-[-4px]">Template de créneau</SheetTitle>
              <div className="text-sm text-text-light">
                {`${dayjs(slotTemplate?.startTime)
                  .format('dddd D MMMM [de] hh:mm')
                  .replace(/^./, (c) => c.toUpperCase())}
                    ${dayjs(slotTemplate?.endTime).format('[à] hh:mm')}
                    ${formatDuration(slotTemplate?.startTime, slotTemplate?.endTime)}`}
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
