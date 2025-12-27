import { useForm } from '@tanstack/react-form'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useSoignantMutations } from '../../../queries/useSoignant.ts'
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

function AddSoignantForm() {
  const [open, setOpen] = useState(false)
  const { createSoignant } = useSoignantMutations()

  const form = useForm({
    defaultValues: {
      name: '',
    },
    onSubmit: ({ value }) => {
      console.log('Submitting soignant:', value)
      createSoignant.mutate(value)
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
            Ajouter un soignant
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

export default AddSoignantForm
