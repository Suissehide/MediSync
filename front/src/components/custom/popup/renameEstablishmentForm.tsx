import type { UseMutationResult } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useEffect } from 'react'

import { useAppForm } from '@/hooks/formConfig.tsx'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface RenameEstablishmentFormProps {
  establishment: { id: string; name: string } | null
  onClose: () => void
  // Super-admin ou chef d'établissement : chacun passe sa propre mutation.
  rename: UseMutationResult<unknown, Error, { id: string; name: string }>
}

// Renommer un établissement (fiche super-admin, ou administration par son chef).
// Même forme que `renameServiceForm.tsx` : `establishment` vaut `null` tant
// que la popup est fermée.
function RenameEstablishmentForm({
  establishment,
  onClose,
  rename: renameEstablishment,
}: RenameEstablishmentFormProps) {
  const form = useAppForm({
    defaultValues: { name: establishment?.name ?? '' },
    onSubmit: ({ value }) => {
      if (!establishment) {
        return
      }
      renameEstablishment.mutate(
        { id: establishment.id, name: value.name },
        { onSuccess: () => onClose() },
      )
    },
  })

  useEffect(() => {
    if (establishment) {
      form.reset({ name: establishment.name })
    }
  }, [establishment, form])

  return (
    <Popup
      modal={true}
      open={establishment !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Renommer l'établissement
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
              {(field) => <field.Input label="Nom de l'établissement" />}
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
            isLoading={renameEstablishment.isPending}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default RenameEstablishmentForm
