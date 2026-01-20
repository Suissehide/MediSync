import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { usePathwayTemplateMutations } from '../../../queries/usePathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
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

  const form = useAppForm({
    defaultValues: {
      name: '',
      color: '#2563eb',
    },
    onSubmit: ({ value }) => {
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
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <form.AppField
              name="name"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le nom est nécessaire',
              }}
            >
              {(field) => <field.Input label="Nom" />}
            </form.AppField>

            <form.AppField name="color">
              {(field) => <field.ColorPicker label="Couleur" />}
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

export default AddPathwayForm
