import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import {
  usePathwayTemplateMutations,
  usePathwayTemplateQueries,
} from '../../../queries/usePathwayTemplate.ts'
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
import { TagInput } from '../../ui/tagInput.tsx'

interface AddPathwayFormProps {
  trigger?: React.ReactNode
}

function AddPathwayForm({ trigger }: AddPathwayFormProps) {
  const [open, setOpen] = useState(false)
  const [secondaryTags, setSecondaryTags] = useState<string[]>([])
  const { createPathwayTemplate } = usePathwayTemplateMutations()
  const { pathwayTemplates } = usePathwayTemplateQueries()

  const mainTagSuggestions = useMemo(
    () => [...new Set((pathwayTemplates ?? []).map((t) => t.mainTag))].sort(),
    [pathwayTemplates],
  )
  const secondaryTagSuggestions = useMemo(
    () =>
      [
        ...new Set(
          (pathwayTemplates ?? []).flatMap((t) => t.secondaryTags ?? []),
        ),
      ].sort(),
    [pathwayTemplates],
  )

  const form = useAppForm({
    defaultValues: {
      name: '',
      color: '#2563eb',
      mainTag: '',
      motifRequired: false,
      firstAppointmentOnly: false,
    },
    onSubmit: ({ value }) => {
      createPathwayTemplate.mutate({
        name: value.name,
        color: value.color,
        slotTemplateIDs: [],
        mainTag: value.mainTag.trim(),
        secondaryTags,
        motifRequired: value.motifRequired,
        firstAppointmentOnly: value.firstAppointmentOnly,
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
      setSecondaryTags([])
    }
  }, [open, form])

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="none"
            size="icon"
            onClick={() => setOpen(true)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Créer un parcours
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

            <form.AppField name="color">
              {(field) => <field.ColorPicker label="Couleur" />}
            </form.AppField>

            <form.AppField
              name="mainTag"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim() ? undefined : 'Le tag principal est nécessaire',
              }}
            >
              {(field) => (
                <field.Input
                  label="Tag principal"
                  placeholder="Affiché sur la liste des patients"
                  list="main-tag-suggestions"
                />
              )}
            </form.AppField>
            <datalist id="main-tag-suggestions">
              {mainTagSuggestions.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>

            <div className="flex flex-col gap-1">
              <Label>Tags secondaires</Label>
              <TagInput
                value={secondaryTags}
                onChange={setSecondaryTags}
                suggestions={secondaryTagSuggestions}
                placeholder="Affichés sur le planning..."
              />
            </div>

            <form.AppField name="motifRequired">
              {(field) => (
                <field.Checkbox label="Motif obligatoire" />
              )}
            </form.AppField>

            <form.AppField name="firstAppointmentOnly">
              {(field) => (
                <field.Checkbox
                  label="Inscription au premier RDV uniquement"
                  description="Le parcours devient individuel : le patient est inscrit uniquement au premier créneau disponible, au lieu de l’ensemble des créneaux du parcours."
                />
              )}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button variant="default" onClick={() => form.handleSubmit()}>
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddPathwayForm
