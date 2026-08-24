import type { Dayjs } from 'dayjs'
import { RefreshCw, X } from 'lucide-react'

import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { Select } from '../../ui/select.tsx'

interface RegeneratePathwaysFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  templates: PathwayTemplate[]
  templateID: string
  onTemplateChange: (value: string) => void
  fromDate: Dayjs | null
  onFromDateChange: (value: Dayjs | null) => void
  onConfirm: () => void
  isPending: boolean
}

export function RegeneratePathwaysForm({
  open,
  setOpen,
  templates,
  templateID,
  onTemplateChange,
  fromDate,
  onFromDateChange,
  onConfirm,
  isPending,
}: RegeneratePathwaysFormProps) {
  const options = templates.map((template) => ({
    value: template.id,
    label: template.name,
  }))

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
            <div>
              <Label className="block text-sm font-medium text-text-dark mb-1">
                Modèle de parcours
              </Label>
              <Select
                options={options}
                placeholder="Choisir un modèle..."
                value={templateID}
                onValueChange={onTemplateChange}
                searchable
                clearable={false}
              />
            </div>

            <div>
              <Label className="block text-sm font-medium text-text-dark mb-1">
                À partir du
              </Label>
              <DatePicker
                value={fromDate}
                onChange={(value) => onFromDateChange(value)}
              />
            </div>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={!templateID || !fromDate || isPending}
          >
            <RefreshCw className="w-4 h-4" />
            Appliquer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
