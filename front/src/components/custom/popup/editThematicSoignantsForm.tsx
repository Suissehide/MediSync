import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { SLOT_DURATION_OPTIONS } from '../../../constants/slot.constant.ts'
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

  const form = useAppForm({
    defaultValues: {
      name: thematic.name,
      duration: thematic.duration ?? 15,
      soignantIDs: thematic.soignants.map((s) => s.id),
    },
    onSubmit: ({ value }) => {
      const currentSoignantIDs = thematic.soignants.map((s) => s.id)
      const duration = Number(value.duration)
      const nameChanged = value.name !== thematic.name
      const durationChanged = duration !== thematic.duration
      const soignantsChanged =
        value.soignantIDs.length !== currentSoignantIDs.length ||
        value.soignantIDs.some((id) => !currentSoignantIDs.includes(id))

      if (nameChanged || durationChanged || soignantsChanged) {
        updateThematic.mutate({
          id: thematic.id,
          ...(nameChanged ? { name: value.name } : {}),
          ...(durationChanged ? { duration } : {}),
          ...(soignantsChanged ? { soignantIDs: value.soignantIDs } : {}),
        })
      }

      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: thematic.name,
        duration: thematic.duration ?? 15,
        soignantIDs: thematic.soignants.map((s) => s.id),
      })
    }
  }, [open, thematic, form])

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

            <form.AppField name="duration">
              {(field) => (
                <field.Select
                  options={SLOT_DURATION_OPTIONS}
                  label="Durée par défaut"
                />
              )}
            </form.AppField>

            <form.Field name="soignantIDs">
              {(field) => (
                <div className="flex flex-col gap-1">
                  <Label className="text-sm font-medium">Soignants</Label>
                  <MultiSelect
                    options={soignantOptions}
                    value={field.state.value}
                    onChange={(val) => field.handleChange(val)}
                    placeholder="Sélectionner des soignants"
                  />
                </div>
              )}
            </form.Field>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
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
