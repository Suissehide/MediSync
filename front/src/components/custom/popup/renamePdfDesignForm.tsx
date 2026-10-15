import { Check, X } from 'lucide-react'
import { useEffect } from 'react'

import { useAppForm } from '@/hooks/formConfig.tsx'
import { usePdfDesignMutations } from '@/queries/usePdfDesign.ts'
import type { PdfDesignSummary } from '@/types/pdfDesignList.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface RenamePdfDesignFormProps {
  design: PdfDesignSummary | null
  onClose: () => void
}

// `design` vaut `null` tant qu'aucune carte n'est choisie, ce qui ferme la popup.
function RenamePdfDesignForm({ design, onClose }: RenamePdfDesignFormProps) {
  const { renameDesign } = usePdfDesignMutations()

  const form = useAppForm({
    defaultValues: { name: design?.name ?? '' },
    onSubmit: ({ value }) => {
      if (!design) {
        return
      }
      renameDesign.mutate(
        { id: design.id, name: value.name },
        { onSuccess: () => onClose() },
      )
    },
  })

  useEffect(() => {
    if (design) {
      form.reset({ name: design.name })
    }
  }, [design, form])

  return (
    <Popup
      modal={true}
      open={design !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Renommer le design
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
              {(field) => <field.Input label="Nom du design" />}
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
            isLoading={renameDesign.isPending}
          >
            <Check className="w-4 h-4" />
            Enregistrer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default RenamePdfDesignForm
