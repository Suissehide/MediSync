import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAppForm } from '@/hooks/formConfig.tsx'
import { useServiceMutations } from '@/queries/useServices.ts'
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

// Onglet des services : créer un service — voir
// `services.tsx`. Créer y rattache automatiquement le créateur, comme
// COORDINATEUR (back, `serviceDomain.create`) ; rien à choisir ici.
function CreateServiceForm() {
  const [open, setOpen] = useState(false)
  const { createService } = useServiceMutations()

  const form = useAppForm({
    defaultValues: { name: '' },
    onSubmit: ({ value }) => {
      createService.mutate(
        { name: value.name },
        { onSuccess: () => setOpen(false) },
      )
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
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Créer un service
        </Button>
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Créer un service
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
            <form.AppField
              name="name"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim() ? undefined : 'Le nom est nécessaire',
              }}
            >
              {(field) => <field.Input label="Nom du service" />}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={createService.isPending}
          >
            <Check className="w-4 h-4" />
            Créer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default CreateServiceForm
