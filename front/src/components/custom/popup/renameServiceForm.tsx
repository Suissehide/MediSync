import { Check, X } from 'lucide-react'
import { useEffect } from 'react'

import { useAppForm } from '@/hooks/formConfig.tsx'
import { useServiceMutations } from '@/queries/useServices.ts'
import type { Service } from '@/types/service.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface RenameServiceFormProps {
  service: Service | null
  onClose: () => void
}

// Onglet des services (tâche 13, step 1) : renommer. Ouvert depuis
// `services.tsx` (bouton crayon de `service.column.tsx`), plutôt qu'un
// déclencheur local : `service` vaut `null` tant qu'aucune ligne n'est
// choisie, ce qui ferme la popup.
function RenameServiceForm({ service, onClose }: RenameServiceFormProps) {
  const { updateService } = useServiceMutations()

  const form = useAppForm({
    defaultValues: { name: service?.name ?? '' },
    onSubmit: ({ value }) => {
      if (!service) {
        return
      }
      updateService.mutate(
        { id: service.id, name: value.name },
        { onSuccess: () => onClose() },
      )
    },
  })

  useEffect(() => {
    if (service) {
      form.reset({ name: service.name })
    }
  }, [service, form])

  return (
    <Popup
      modal={true}
      open={service !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Renommer le service
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
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={updateService.isPending}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default RenameServiceForm
