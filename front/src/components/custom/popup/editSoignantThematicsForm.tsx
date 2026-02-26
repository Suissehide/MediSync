import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSoignantMutations } from '../../../queries/useSoignant.ts'
import { useThematicMutations } from '../../../queries/useThematic.ts'
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
import { MultiSelect } from '../../ui/select.tsx'

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

  const [selectedIDs, setSelectedIDs] = useState<string[]>(currentThematicIDs)

  const form = useAppForm({
    defaultValues: { name: soignant.name },
    onSubmit: () => {},
  })

  useEffect(() => {
    if (open) {
      setSelectedIDs(currentThematicIDs)
      form.reset({ name: soignant.name })
    }
  }, [open, currentThematicIDs, soignant.name, form])

  const handleSave = async () => {
    await form.validate('submit')
    if (!form.state.isValid) {
      return
    }

    const name = form.state.values.name
    if (name !== soignant.name) {
      updateSoignant.mutate({ id: soignant.id, name, active: true })
    }

    const added = selectedIDs.filter((id) => !currentThematicIDs.includes(id))
    const removed = currentThematicIDs.filter((id) => !selectedIDs.includes(id))

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
  }

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
          <PopupTitle className="font-bold text-2xl m-0!">
            Modifier {soignant.name}
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

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Thématiques</span>
              <MultiSelect
                options={thematicOptions}
                value={selectedIDs}
                onChange={setSelectedIDs}
                placeholder="Sélectionner des thématiques"
              />
            </div>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={handleSave}>
            <Check className="w-4 h-4" />
            Enregistrer
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

export default EditSoignantThematicsForm
