import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { useSoignantMutations } from '../../../queries/useSoignant.ts'
import {
  useThematicMutations,
  useThematicQueries,
} from '../../../queries/useThematic.ts'
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

interface AddSoignantFormProps {
  trigger?: React.ReactNode
}

function AddSoignantForm({ trigger }: AddSoignantFormProps) {
  const [open, setOpen] = useState(false)
  const { createSoignant } = useSoignantMutations()
  const { thematics } = useThematicQueries()
  const { updateThematic } = useThematicMutations()

  const thematicOptions =
    thematics?.map((t) => ({ value: t.id, label: t.name })) ?? []

  const form = useAppForm({
    defaultValues: {
      name: '',
      thematicIDs: [] as string[],
    },
    onSubmit: ({ value }) => {
      createSoignant.mutate(
        { name: value.name },
        {
          onSuccess: (createdSoignant) => {
            for (const thematicID of value.thematicIDs) {
              const thematic = thematics?.find((t) => t.id === thematicID)
              if (thematic) {
                updateThematic.mutate({
                  id: thematicID,
                  soignantIDs: [
                    ...thematic.soignants.map((s) => s.id),
                    createdSoignant.id,
                  ],
                })
              }
            }
          },
        },
      )
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
            Nouveau soignant
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-2xl m-0!">
            Ajouter un soignant
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

            <form.Field name="thematicIDs">
              {(field) => (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Thématiques</span>
                  <MultiSelect
                    options={thematicOptions}
                    value={field.state.value}
                    onChange={(val) => field.handleChange(val)}
                    placeholder="Sélectionner des thématiques"
                  />
                </div>
              )}
            </form.Field>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="default" onClick={() => form.handleSubmit()}>
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

export default AddSoignantForm
