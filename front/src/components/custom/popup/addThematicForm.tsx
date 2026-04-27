import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { SLOT_DURATION_OPTIONS } from '../../../constants/slot.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useThematicMutations } from '../../../queries/useThematic.ts'
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

interface AddThematicFormProps {
  trigger?: React.ReactNode
}

function AddThematicForm({ trigger }: AddThematicFormProps) {
  const [open, setOpen] = useState(false)
  const { createThematic } = useThematicMutations()
  const { soignants } = useSoignantQueries()

  const soignantOptions = useMemo(
    () =>
      [...(soignants ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((s) => ({ value: s.id, label: s.name })),
    [soignants],
  )

  const form = useAppForm({
    defaultValues: {
      name: '',
      duration: 15,
      soignantIDs: [] as string[],
    },
    onSubmit: ({ value }) => {
      createThematic.mutate({
        name: value.name,
        duration: Number(value.duration),
        soignantIDs: value.soignantIDs,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="default" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />
            Nouvelle thématique
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter une thématique
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.validate('submit')
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
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
          </form>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            isLoading={createThematic.isPending}
            onClick={() => form.handleSubmit()}
          >
            <Check className="w-4 h-4" />
            Ajouter
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

export default AddThematicForm
