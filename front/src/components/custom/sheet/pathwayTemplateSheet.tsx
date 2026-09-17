import { Loader2Icon, Route } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { hexToRGBA } from '../../../libs/color.ts'
import {
  usePathwayTemplateByIDQuery,
  usePathwayTemplateMutations,
  usePathwayTemplateQueries,
} from '../../../queries/usePathwayTemplate.ts'
import type { UpdatePathwayTemplateParams } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { Label } from '../../ui/label.tsx'
import { TagInput } from '../../ui/tagInput.tsx'
import { ConfirmDeleteForm } from '../popup/confirmDeleteForm.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet.tsx'

interface PathwayTemplateSheetProps {
  open: boolean
  setOpen: (openPathwayTemplateId: string) => void
  pathwayTemplateID: string
}

export default function PathwayTemplateSheet({
  open,
  setOpen,
  pathwayTemplateID,
}: PathwayTemplateSheetProps) {
  const { pathwayTemplate, isPending } = usePathwayTemplateByIDQuery(pathwayTemplateID)
  const { updatePathwayTemplate, deletePathwayTemplate } =
    usePathwayTemplateMutations()
  const { pathwayTemplates } = usePathwayTemplateQueries()

  const [secondaryTags, setSecondaryTags] = useState<string[]>([])

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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: '',
      color: '',
      mainTag: '',
      motifRequired: false,
      firstAppointmentOnly: false,
    },
    onSubmit: ({ value }) => {
      if (!pathwayTemplate?.id) {
        return
      }

      const updatedPathwayTemplateData: UpdatePathwayTemplateParams = {
        id: pathwayTemplate.id,
        name: value.name,
        color: value.color,
        mainTag: value.mainTag.trim(),
        secondaryTags,
        motifRequired: value.motifRequired,
        firstAppointmentOnly: value.firstAppointmentOnly,
      }

      updatePathwayTemplate.mutate(updatedPathwayTemplateData)
      setOpen('')
    },
  })

  const handleDelete = () => {
    if (pathwayTemplate) {
      deletePathwayTemplate.mutate(pathwayTemplate.id)
      setOpen('')
    }
  }

  const { reset } = form

  useEffect(() => {
    if (!pathwayTemplate || !open) {
      return
    }

    reset(
      {
        name: pathwayTemplate.name ?? '',
        color: pathwayTemplate.color ?? '',
        mainTag: pathwayTemplate.mainTag ?? '',
        motifRequired: pathwayTemplate.motifRequired ?? false,
        firstAppointmentOnly: pathwayTemplate.firstAppointmentOnly ?? false,
      },
      { keepDefaultValues: true },
    )
    setSecondaryTags(pathwayTemplate.secondaryTags ?? [])
  }, [pathwayTemplate, open, reset])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => setOpen(isOpen ? pathwayTemplateID : '')}
    >
      <SheetContent className="flex flex-col h-full">
        <SheetHeader className="flex flex-row justify-between items-center">
          <div className="flex items-center gap-4">
            <div
              className="relative flex justify-center items-center w-9.5 h-9.5 rounded-md"
              style={{
                backgroundColor: hexToRGBA(
                  pathwayTemplate?.color ?? '#2563eb',
                  0.15,
                ),
              }}
            >
              <Route
                className="w-5 h-5"
                style={{ color: pathwayTemplate?.color ?? '#2563eb' }}
              />
            </div>
            <div>
              <SheetTitle className="mb-[-4px]">
                Modifier le parcours
              </SheetTitle>
              <div className="text-sm text-text-light">
                {pathwayTemplate?.name}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {isPending ? (
            <div className="flex-1 flex justify-center items-center">
              <Loader2Icon className="size-10 animate-spin text-foreground" />
            </div>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await form.handleSubmit()
                }}
                className="w-full flex-1 flex flex-col min-h-0 gap-4 px-4 py-4"
              >
                <form.AppField
                  name="name"
                  validators={{
                    onSubmit: ({ value }) =>
                      value ? undefined : 'Le nom est nécessaire',
                  }}
                >
                  {(field) => <field.Input label="Nom du parcours" />}
                </form.AppField>

                <form.AppField name="color">
                  {(field) => <field.ColorPicker label="Couleur" />}
                </form.AppField>

                <form.AppField
                  name="mainTag"
                  validators={{
                    onSubmit: ({ value }) =>
                      value.trim()
                        ? undefined
                        : 'Le tag principal est nécessaire',
                  }}
                >
                  {(field) => (
                    <field.Input
                      label="Tag principal"
                      placeholder="Affiché sur la liste des patients"
                      list="main-tag-suggestions-edit"
                    />
                  )}
                </form.AppField>
                <datalist id="main-tag-suggestions-edit">
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

              <div className="w-full border-t border-border-dark"></div>

              <div className="px-4 py-4 flex justify-between gap-4 shrink-0">
                <div>
                  <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                    Supprimer
                  </Button>
                </div>
                <div className="flex gap-4">
                  <Button variant="default" onClick={() => form.handleSubmit()} isLoading={updatePathwayTemplate.isPending}>
                    Mettre à jour
                  </Button>
                  <Button variant="outline" onClick={() => setOpen('')}>
                    Annuler
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
      <ConfirmDeleteForm
        open={showDeleteConfirm}
        setOpen={setShowDeleteConfirm}
        onConfirm={() => {
          handleDelete()
          setShowDeleteConfirm(false)
        }}
        loading={deletePathwayTemplate.isPending}
        title="Supprimer le modèle de parcours"
        description="Voulez-vous vraiment supprimer ce modèle de parcours ? Cette action est irréversible."
      />
    </Sheet>
  )
}
