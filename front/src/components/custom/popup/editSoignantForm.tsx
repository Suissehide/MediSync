import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSoignantMutations } from '../../../queries/useSoignant.ts'
import type { Soignant } from '../../../types/soignant.ts'
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

// Navigation par echelle (2026-09-28) : l'ecran Soignants vit a l'echelle de l'etablissement,
// sans service en contexte. Il ne modifie donc plus que le NOM du soignant, donnee
// d'etablissement. Le rattachement aux thematiques est une donnee de service
// (`SoignantThematic.serviceId`) : il se fait depuis l'ecran Thematiques de chaque service
// (`editThematicSoignantsForm.tsx`).
interface EditSoignantFormProps {
  soignant: Soignant
  trigger?: React.ReactNode
}

function EditSoignantForm({ soignant, trigger }: EditSoignantFormProps) {
  const [open, setOpen] = useState(false)
  const { updateSoignant } = useSoignantMutations()

  const form = useAppForm({
    defaultValues: {
      name: soignant.name,
    },
    onSubmit: ({ value }) => {
      if (value.name !== soignant.name) {
        updateSoignant.mutate({
          id: soignant.id,
          name: value.name,
          active: true,
        })
      }
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: soignant.name })
    }
  }, [open, soignant.name, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="icon"
            aria-label={`Renommer ${soignant.name}`}
            onClick={() => setOpen(true)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Modifier le soignant
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form.AppField
            name="name"
            validators={{
              onSubmit: ({ value }) =>
                value ? undefined : 'Le nom est nécessaire',
            }}
          >
            {(field) => <field.Input label="Nom" />}
          </form.AppField>
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

export default EditSoignantForm
