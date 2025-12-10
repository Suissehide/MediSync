import { useForm } from '@tanstack/react-form'
import { Plus } from 'lucide-react'

import { useTodoMutations } from '../../../queries/useTodo.ts'
import { Button } from '../../ui/button.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
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

  const form = useForm({
    defaultValues: {
      title: '',
      description: '',
      assignTo: '',
    },
    onSubmit: ({ value }) => {
      console.log('Submitting todo:', value)
      createTodo.mutate(value)
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
            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value ? undefined : 'Le titre est nécessaire',
              }}
            >
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Titre</Label>
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

            <form.Field name="description">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Description</Label>
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

            <form.Field name="assignTo">
              {(field) => (
                <FormField>
                  <Label htmlFor={field.name}>Assigné à</Label>
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

            <Button type="submit" className="mt-2">
              Ajouter
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
