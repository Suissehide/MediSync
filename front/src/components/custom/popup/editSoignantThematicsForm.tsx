import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSoignantMutations } from '../../../queries/useSoignant.ts'
import { useThematicMutations } from '../../../queries/useThematic.tsx'
import type { Soignant } from '../../../types/soignant.ts'
import type { Thematic } from '../../../types/thematic.ts'
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

interface EditSoignantThematicsFormProps {
  soignant: Soignant
  thematics: Thematic[]
  thematicOptions: { value: string; label: string }[]
  trigger?: React.ReactNode
}

function EditSoignantThematicsForm({
  soignant,
  thematics,
  thematicOptions,
  trigger,
}: EditSoignantThematicsFormProps) {
  const [open, setOpen] = useState(false)
  const { updateThematic } = useThematicMutations()
  const { updateSoignant } = useSoignantMutations()

  const currentThematicIDs = useMemo(
    () =>
      thematics
        .filter((t) => t.soignants.some((s) => s.id === soignant.id))
        .map((t) => t.id),
    [thematics, soignant.id],
  )

  const form = useAppForm({
    defaultValues: {
      name: soignant.name,
      thematicIDs: currentThematicIDs,
    },
    onSubmit: ({ value }) => {
      if (value.name !== soignant.name) {
        updateSoignant.mutate({
          id: soignant.id,
          name: value.name,
        })
      }

      const added = value.thematicIDs.filter(
        (id) => !currentThematicIDs.includes(id),
      )
      const removed = currentThematicIDs.filter(
        (id) => !value.thematicIDs.includes(id),
      )

      for (const thematicID of added) {
        const thematic = thematics.find((t) => t.id === thematicID)
        if (thematic) {
          updateThematic.mutate({
            id: thematicID,
            soignantIDs: [...thematic.soignants.map((s) => s.id), soignant.id],
          })
        }
      }

      for (const thematicID of removed) {
        const thematic = thematics.find((t) => t.id === thematicID)
        if (thematic) {
          updateThematic.mutate({
            id: thematicID,
            soignantIDs: thematic.soignants
              .filter((s) => s.id !== soignant.id)
              .map((s) => s.id),
          })
        }
      }

      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: soignant.name,
        thematicIDs: currentThematicIDs,
      })
    }
  }, [open, currentThematicIDs, soignant.name, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="icon"
            aria-label={`Modifier ${soignant.name} et ses thématiques`}
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

            <form.AppField name="thematicIDs">
              {(field) => (
                <field.MultiSelect
                  label="Thématiques"
                  options={thematicOptions}
                  placeholder="Sélectionner des thématiques"
                />
              )}
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

export default EditSoignantThematicsForm
