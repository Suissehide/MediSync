import { BriefcaseMedical, Check, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

import {
  useDiagnosticMutations,
  useDiagnosticTemplatesQuery,
} from '../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticStore } from '../../../store/useDiagnosticStore.ts'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
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

interface Props {
  patientId: string
  trigger?: React.ReactNode
}

function AddDiagnosticForm({ patientId, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [title, setTitle] = useState('')

  const { templates } = useDiagnosticTemplatesQuery()
  const { createDiagnostic } = useDiagnosticMutations(patientId)
  const { setSelectedId } = useDiagnosticStore()

  const handleCreate = () => {
    createDiagnostic.mutate(
      {
        patientId,
        activeFields: [],
        templateId: selectedTemplateId ?? undefined,
        title: title || undefined,
      },
      {
        onSuccess: (created) => {
          setSelectedId(created.id)
          setSelectedTemplateId(null)
          setTitle('')
          setOpen(false)
        },
      },
    )
  }

  return (
    <Popup
      modal={true}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setSelectedTemplateId(null)
          setTitle('')
        }
      }}
    >
      <PopupTrigger asChild>
        {trigger ?? (
          <Button variant="gradient" size="sm">
            Nouveau diagnostic
          </Button>
        )}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle>Nouveau diagnostic éducatif</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-3">
            Choisissez un template pour pré-configurer les champs actifs, ou
            créez un diagnostic vierge.
          </p>

          <div className="p-4 bg-input rounded-xl">
            <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(null)
                    setTitle('')
                  }}
                  className={`cursor-pointer bg-background w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedTemplateId === null
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-card'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BriefcaseMedical
                      className={`w-4 h-4 ${selectedTemplateId === null ? 'text-primary' : 'text-text-light'}`}
                    />
                    <span
                      className={`text-sm font-medium ${selectedTemplateId === null ? 'text-primary' : 'text-text-dark'}`}
                    >
                      Sans template
                    </span>
                  </div>
                  <p className="text-xs text-text-light mt-0.5 pl-6">
                    Diagnostic vierge, tous les champs désactivés
                  </p>
                </button>
              </li>

              {templates?.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(t.id)
                      setTitle(t.name)
                    }}
                    className={`cursor-pointer bg-background w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      selectedTemplateId === t.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BriefcaseMedical
                        className={`w-4 h-4 ${selectedTemplateId === t.id ? 'text-primary' : 'text-text-light'}`}
                      />
                      <span
                        className={`text-sm font-medium ${selectedTemplateId === t.id ? 'text-primary' : 'text-text-dark'}`}
                      >
                        {t.name}
                      </span>
                    </div>
                    <p className="text-xs text-text-light mt-0.5 pl-6">
                      {t.activeFields.length}{' '}
                      {t.activeFields.length > 1
                        ? ' champs actifs'
                        : ' champ actif'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5 mb-4 mt-4">
            <Label>Titre</Label>
            <Input
              placeholder="Sans titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={handleCreate}
            disabled={createDiagnostic.isPending}
          >
            <Check className="w-4 h-4" />
            Créer
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddDiagnosticForm
