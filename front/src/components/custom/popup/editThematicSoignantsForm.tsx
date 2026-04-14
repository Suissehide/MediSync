import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useThematicMutations } from '../../../queries/useThematic.ts'
import type { Thematic } from '../../../types/thematic.ts'
import { Button } from '../../ui/button.tsx'
import { Label } from '../../ui/label.tsx'
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

interface EditThematicSoignantsFormProps {
  thematic: Thematic
  soignantOptions: { value: string; label: string }[]
  trigger?: React.ReactNode
}

function EditThematicSoignantsForm({
  thematic,
  soignantOptions,
  trigger,
}: EditThematicSoignantsFormProps) {
  const [open, setOpen] = useState(false)
  const { updateThematic } = useThematicMutations()

  const currentSoignantIDs = thematic.soignants.map((s) => s.id)

  const [selectedIDs, setSelectedIDs] = useState<string[]>(currentSoignantIDs)

  const form = useAppForm({
    defaultValues: { name: thematic.name },
    onSubmit: () => {},
  })

  useEffect(() => {
    if (open) {
      setSelectedIDs(currentSoignantIDs)
      form.reset({ name: thematic.name })
    }
  }, [open, thematic.name, thematic.soignants, form])

  const handleSave = async () => {
    await form.validate('submit')
    if (!form.state.isValid) {
      return
    }

    const name = form.state.values.name
    const nameChanged = name !== thematic.name
    const soignantsChanged =
      selectedIDs.length !== currentSoignantIDs.length ||
      selectedIDs.some((id) => !currentSoignantIDs.includes(id))

    if (nameChanged || soignantsChanged) {
      updateThematic.mutate({
        id: thematic.id,
        ...(nameChanged ? { name } : {}),
        ...(soignantsChanged ? { soignantIDs: selectedIDs } : {}),
      })
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
          <PopupTitle className="font-bold text-xl">
            Modifier la thématique
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
              <Label className="text-sm font-medium">Soignants</Label>
              <MultiSelect
                options={soignantOptions}
                value={selectedIDs}
                onChange={setSelectedIDs}
                placeholder="Sélectionner des soignants"
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

export default EditThematicSoignantsForm
