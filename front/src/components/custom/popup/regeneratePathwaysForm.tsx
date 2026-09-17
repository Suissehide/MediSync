import { RefreshCw, X } from 'lucide-react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { usePathwayMutations } from '../../../queries/usePathway.ts'
import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface RegeneratePathwaysFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  templates: PathwayTemplate[]
}

export function RegeneratePathwaysForm({
  open,
  setOpen,
  templates,
}: RegeneratePathwaysFormProps) {
  const { regeneratePathways } = usePathwayMutations()

  const options = templates.map((template) => ({
    value: template.id,
    label: template.name,
    color: template.color,
  }))

  const form = useAppForm({
    defaultValues: { templateID: '', fromDate: '' },
    onSubmit: ({ value }) => {
      if (!value.templateID || !value.fromDate) {
        return
      }
      regeneratePathways.mutate(
        {
          pathwayTemplateID: value.templateID,
          fromDate: value.fromDate,
        },
        {
          onSuccess: () => {
            setOpen(false)
            form.reset()
          },
        },
      )
    },
  })

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Mettre à jour les parcours instanciés
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            Les créneaux vides des parcours de ce modèle démarrant à partir de
            la date choisie seront régénérés selon le modèle théorique actuel.
            Les créneaux ayant déjà des rendez-vous sont conservés.
          </p>

          <div className="flex flex-col gap-4 max-w-md">
            <form.AppField name="templateID">
              {(field) => (
                <field.Select
                  label="Modèle de parcours"
                  options={options}
                  placeholder="Choisir un modèle..."
                  searchable
                  clearable={false}
                />
              )}
            </form.AppField>

            <form.AppField name="fromDate">
              {(field) => <field.DatePicker label="À partir du" />}
            </form.AppField>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <form.Subscribe
            selector={(state) => ({
              templateID: state.values.templateID,
              fromDate: state.values.fromDate,
            })}
          >
            {({ templateID, fromDate }) => (
              <Button
                variant="default"
                onClick={() => form.handleSubmit()}
                disabled={
                  !templateID || !fromDate || regeneratePathways.isPending
                }
              >
                <RefreshCw className="w-4 h-4" />
                Appliquer
              </Button>
            )}
          </form.Subscribe>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
