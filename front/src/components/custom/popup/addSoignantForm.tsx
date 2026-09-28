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

interface AddSoignantFormProps {
  trigger?: React.ReactNode
}

type Thematiques = {
  thematics: ReturnType<typeof useThematicQueries>['thematics']
  updateThematic: ReturnType<typeof useThematicMutations>['updateThematic']
}

// Sous un service (panneau lateral des ecrans de service) : creation ET rattachement aux
// thematiques du service courant.
function AddSoignantForm({ trigger }: AddSoignantFormProps) {
  const { thematics } = useThematicQueries()
  const { updateThematic } = useThematicMutations()
  return <SoignantCreationForm trigger={trigger} thematiques={{ thematics, updateThematic }} />
}

// A l'echelle de l'etablissement (ecran Soignants de l'administration, navigation par echelle
// 2026-09-28) : aucun service en contexte, donc aucune thematique a proposer —
// `useThematicQueries` y leverait (`tenantApiUrl`). Le nom seul.
export function AddEstablishmentSoignantForm({ trigger }: AddSoignantFormProps) {
  return <SoignantCreationForm trigger={trigger} thematiques={null} />
}

function SoignantCreationForm({
  trigger,
  thematiques,
}: AddSoignantFormProps & { thematiques: Thematiques | null }) {
  const [open, setOpen] = useState(false)
  const { createSoignant } = useSoignantMutations()
  const thematics = thematiques?.thematics

  const thematicOptions =
    thematics
      ?.slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((t) => ({ value: t.id, label: t.name })) ?? []

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
              if (thematic && thematiques) {
                thematiques.updateThematic.mutate({
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
          <PopupTitle className="font-bold text-xl">
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

            {thematiques && (
              <form.Field name="thematicIDs">
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm font-medium">Thématiques</Label>
                    <MultiSelect
                      options={thematicOptions}
                      value={field.state.value}
                      onChange={(val) => field.handleChange(val)}
                      placeholder="Sélectionner des thématiques"
                    />
                  </div>
                )}
              </form.Field>
            )}
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={createSoignant.isPending}
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddSoignantForm
