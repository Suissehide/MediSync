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

interface RenamePdfDesignFormProps {
  design: { id: string; name: string } | null
  onClose: () => void
  // LA MUTATION VIENT DE L'ECRAN : un design de service et un modele livre ne passent pas
  // par la meme route, et souder celle du tenant ici rendait cette popup inutilisable hors
  // tenant — le bouton « Renommer » de l'ecran super-admin etait un bouton MORT.
  onRenommer: (params: { id: string; name: string }) => Promise<unknown>
  enCours: boolean
  titre?: string
  libelle?: string
}

// `design` vaut `null` tant qu'aucune carte n'est choisie, ce qui ferme la popup.
function RenamePdfDesignForm({
  design,
  onClose,
  onRenommer,
  enCours,
  titre = 'Renommer le design',
  libelle = 'Nom du design',
}: RenamePdfDesignFormProps) {
  const form = useAppForm({
    defaultValues: { name: design?.name ?? '' },
    onSubmit: ({ value }) => {
      if (!design) {
        return
      }
      onRenommer({ id: design.id, name: value.name })
        .then(() => onClose())
        .catch(() => undefined)
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
          <PopupTitle className="font-bold text-xl">{titre}</PopupTitle>
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
              {(field) => <field.Input label={libelle} />}
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
            isLoading={enCours}
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
