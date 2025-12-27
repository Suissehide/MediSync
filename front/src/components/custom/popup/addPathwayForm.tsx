import { useForm } from '@tanstack/react-form'
import { Compact } from '@uiw/react-color'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { usePathwayTemplateMutations } from '../../../queries/usePathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { FieldInfo } from '../../ui/fieldInfo.tsx'
import { FormField } from '../../ui/formField.tsx'
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

function AddPathwayForm() {
  const [open, setOpen] = useState(false)
  const { createPathwayTemplate } = usePathwayTemplateMutations()

  const form = useForm({
    defaultValues: {
      name: '',
      color: '#2563eb',
    },
    onSubmit: ({ value }) => {
      console.log('Submitting soignant:', value)
      createPathwayTemplate.mutate({
        name: value.name,
        color: value.color,
        slotTemplateIDs: [],
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger variant="none" size="icon" asChild>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Créer un parcours
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <form.Field
              name="name"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le nom est nécessaire',
              }}
            >
              {(field) => (
                <FormField>
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

export default AddPathwayForm
