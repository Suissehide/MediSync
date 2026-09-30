import { Plus } from 'lucide-react'
import { useMemo } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useTodoMutations } from '../../../queries/useTodo.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import { Button } from '../../ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../ui/sheet.tsx'

export default function TodoAddSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { createTodo } = useTodoMutations()
  const soignants = useSoignantStore((state) => state.soignants)
  const soignantOptions = useMemo(
    () =>
      soignants.map((soignant) => ({
        value: soignant.id,
        label: soignant.name,
      })),
    [soignants],
  )

  const form = useAppForm({
    defaultValues: {
      title: '',
      description: '',
      soignant: '',
    },
    onSubmit: ({ value }) => {
      createTodo.mutate({
        ...value,
        soignantID: value.soignant,
      })
      onOpenChange(false)
    },
  })

  return (
    <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        variant="default"
        size="default"
        className="relative"
        asChild
      >
        <Button onClick={() => onOpenChange(true)}>
          <Plus className="w-5 h-5 mr-1" />
          Nouvelle tâche
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        hasOverlay={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="!left-auto !right-[500px] translate-x-0 w-[500px] z-99"
      >
        <SheetHeader className="flex flex-row justify-between items-center mb-6">
          <div className="m-0">
            <SheetTitle>Ajouter une tâche</SheetTitle>
          </div>
        </SheetHeader>

        <div className="px-4 h-full">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="space-y-2"
          >
            <form.AppField
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value ? undefined : 'Le titre est nécessaire',
              }}
            >
              {(field) => <field.Input label="Titre" />}
            </form.AppField>

            <form.AppField name="description">
              {(field) => <field.Input label="Description" />}
            </form.AppField>

            <form.AppField name="soignant">
              {(field) => (
                <field.Select label="Assigné à" options={soignantOptions} />
              )}
            </form.AppField>

            <Button type="submit" className="mt-2">
              Ajouter
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
