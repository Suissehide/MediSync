import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useLocationMutations } from '../../../queries/useLocation.ts'
import type { Location } from '../../../types/location.ts'
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

interface EditLocationFormProps {
  location: Location
  trigger?: React.ReactNode
}

function EditLocationForm({ location, trigger }: EditLocationFormProps) {
  const [open, setOpen] = useState(false)
  const { updateLocation } = useLocationMutations()

  const form = useAppForm({
    defaultValues: { name: location.name },
    onSubmit: ({ value }) => {
      if (value.name !== location.name) {
        updateLocation.mutate({ id: location.id, name: value.name })
      }
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: location.name })
    }
  }, [open, location.name, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" onClick={() => setOpen(true)}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Modifier la salle
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="space-y-4">
            <form.AppField
              name="name"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le nom est nécessaire',
              }}
            >
              {(field) => <field.Input label="Nom" />}
            </form.AppField>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default EditLocationForm
