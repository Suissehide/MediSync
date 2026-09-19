import { Check, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { SLOT_DURATION_OPTIONS } from '../../../constants/slot.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useThematicMutations } from '../../../queries/useThematic.ts'
import type { Thematic, UpdateThematicParams } from '../../../types/thematic.ts'
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

type ThematicFormValues = {
  name: string
  duration: number
  pdfNotice: string
  soignantIDs: string[]
}

// Seuls les champs reellement modifies partent dans le PATCH.
function buildThematicPatch(
  thematic: Thematic,
  value: ThematicFormValues,
): Omit<UpdateThematicParams, 'id'> {
  const patch: Omit<UpdateThematicParams, 'id'> = {}
  const duration = Number(value.duration)
  // Une consigne vide vaut « pas de consigne » : on stocke null plutot qu'une
  // chaine vide pour que le PDF n'ait qu'un cas a tester.
  const pdfNotice = value.pdfNotice.trim() || null
  const currentSoignantIDs = thematic.soignants.map((s) => s.id)

  if (value.name !== thematic.name) {
    patch.name = value.name
  }
  if (duration !== thematic.duration) {
    patch.duration = duration
  }
  if (pdfNotice !== (thematic.pdfNotice ?? null)) {
    patch.pdfNotice = pdfNotice
  }
  if (
    value.soignantIDs.length !== currentSoignantIDs.length ||
    value.soignantIDs.some((id) => !currentSoignantIDs.includes(id))
  ) {
    patch.soignantIDs = value.soignantIDs
  }

  return patch
}

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
      pdfNotice: thematic.pdfNotice ?? '',
      soignantIDs: thematic.soignants.map((s) => s.id),
    },
    onSubmit: ({ value }) => {
      const patch = buildThematicPatch(thematic, value)

      if (Object.keys(patch).length > 0) {
        updateThematic.mutate({ id: thematic.id, ...patch })
      }

      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: thematic.name,
        duration: thematic.duration ?? 15,
        pdfNotice: thematic.pdfNotice ?? '',
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

            <form.AppField name="pdfNotice">
              {(field) => (
                <field.TextArea label="Consigne affichée dans le programme PDF" />
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

export default EditThematicSoignantsForm
