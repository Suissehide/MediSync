import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useLocationMutations } from '../../../queries/useLocation.ts'
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

interface AddLocationFormProps {
  trigger?: React.ReactNode
}

function AddLocationForm({ trigger }: AddLocationFormProps) {
  const [open, setOpen] = useState(false)
  const { createLocation } = useLocationMutations()

  const form = useAppForm({
    defaultValues: {
      name: '',
    },
    onSubmit: ({ value }) => {
      createLocation.mutate({ name: value.name })
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
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="default" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />
            Nouvelle salle
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter une salle
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
          </form>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            isLoading={createLocation.isPending}
            onClick={() => form.handleSubmit()}
          >
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

export default AddLocationForm
