import { Loader2Icon, Route } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import { hexToRGBA } from '../../../libs/color.ts'
import {
  usePathwayTemplateByIDQuery,
  usePathwayTemplateMutations,
} from '../../../queries/usePathwayTemplate.ts'
import type { UpdatePathwayTemplateParams } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
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
  const { pathwayTemplate } = usePathwayTemplateByIDQuery(pathwayTemplateID)
  const { updatePathwayTemplate, deletePathwayTemplate } =
    usePathwayTemplateMutations()

  const [isPending] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: '',
      color: '',
    },
    onSubmit: ({ value }) => {
      if (!pathwayTemplate?.id) {
        return
      }

      const updatedPathwayTemplateData: UpdatePathwayTemplateParams = {
        id: pathwayTemplate.id,
        name: value.name,
        color: value.color,
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
      },
      { keepDefaultValues: true },
    )
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
              </form>

              <div className="w-full border-t border-border"></div>

              <div className="px-4 py-4 flex justify-between gap-4 shrink-0">
                <div>
                  <Button variant="destructive" onClick={() => handleDelete()}>
                    Supprimer
                  </Button>
                </div>
                <div className="flex gap-4">
                  <Button variant="default" onClick={() => form.handleSubmit()}>
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
    </Sheet>
  )
}
