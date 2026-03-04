import { Save, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { DIAGNOSTIC_SECTIONS } from '../../../constants/diagnosticEducatif.constant.ts'
import { useAppForm } from '../../../hooks/formConfig.tsx'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'
import { FixedBar } from '../../ui/fixedbar.tsx'
import { Input, TextArea } from '../../ui/input.tsx'
import { Switch } from '../../ui/switch.tsx'
import { ConfirmDeleteForm } from '../popup/confirmDeleteForm.tsx'

type Props = {
  diagnostic: DiagnosticEducatif
  onSave: (updates: Record<string, unknown>) => void
  onDelete: () => void
}

export function DiagnosticForm({ diagnostic, onSave, onDelete }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activeFields, setActiveFields] = useState<string[]>(
    diagnostic.activeFields,
  )
  const [initialActiveFields] = useState<string[]>(diagnostic.activeFields)

  const activeFieldsDirty =
    activeFields.length !== initialActiveFields.length ||
    activeFields.some((f) => !initialActiveFields.includes(f))

  const toggleField = (fieldId: string) => {
    setActiveFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId],
    )
  }

  const form = useAppForm({
    defaultValues: {
      title: String(diagnostic.title ?? ''),
      ...Object.fromEntries(
        DIAGNOSTIC_SECTIONS.flatMap((s) => s.fields).map((f) => {
          const val = diagnostic[f.id as keyof DiagnosticEducatif]
          return [
            f.id,
            f.type === 'number'
              ? ((val as number | null | undefined) ?? undefined)
              : String(val ?? ''),
          ]
        }),
      ),
    } as Record<string, string | number | undefined>,
    onSubmit: ({ value }) => {
      onSave({ ...value, activeFields })
    },
  })

  const groups = DIAGNOSTIC_SECTIONS.reduce<
    { group: string; sections: typeof DIAGNOSTIC_SECTIONS }[]
  >((acc, section) => {
    const existing = acc.find((g) => g.group === section.group)
    if (existing) {
      existing.sections.push(section)
    } else {
      acc.push({ group: section.group, sections: [section] })
    }
    return acc
  }, [])

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await form.validate('submit')
        await form.handleSubmit()
      }}
      className="flex flex-col gap-6 px-[1px]"
    >
      <div className="flex justify-between items-center gap-4 mt-4">
        <form.AppField name="title">
          {(field) => (
            <Input
              placeholder="Sans titre"
              value={String(field.state.value ?? '')}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.AppField>
        <Button
          variant="outline"
          size="default"
          type="button"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
          Supprimer
        </Button>
        <ConfirmDeleteForm
          open={deleteOpen}
          setOpen={setDeleteOpen}
          onConfirm={onDelete}
          description="Voulez-vous vraiment supprimer ce diagnostic éducatif ? Cette action est irréversible."
        />
      </div>

      {groups.map(({ group, sections }) => (
        <div key={group} className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-md font-semibold text-text-dark">{group}</h2>
            <div className="mt-1 flex-1 border-t border-border" />
          </div>

          {sections.map((section) => (
            <div key={section.id} className="bg-input p-6 rounded-lg">
              <h3 className="text-sm font-semibold text-text-dark mb-4">
                {section.label}
              </h3>
              <div className="flex flex-col gap-4">
                {section.fields.map((field) => {
                  const isActive = activeFields.includes(field.id)

                  return (
                    <div key={field.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => toggleField(field.id)}
                        />
                        <span
                          className={`text-sm font-medium ${isActive ? 'text-text-dark' : 'text-text-light'}`}
                        >
                          {field.label}
                        </span>
                      </div>

                      {isActive && (
                        <form.AppField name={field.id}>
                          {(f) =>
                            field.type === 'textarea' ? (
                              <TextArea
                                value={String(f.state.value ?? '')}
                                onChange={(e) =>
                                  f.handleChange(e.target.value)
                                }
                                onBlur={f.handleBlur}
                              />
                            ) : field.type === 'number' ? (
                              <Input
                                type="number"
                                value={
                                  f.state.value != null
                                    ? String(f.state.value)
                                    : ''
                                }
                                onChange={(e) =>
                                  f.handleChange(
                                    e.target.value === ''
                                      ? undefined
                                      : Number(e.target.value),
                                  )
                                }
                                onBlur={f.handleBlur}
                              />
                            ) : (
                              <Input
                                value={String(f.state.value ?? '')}
                                onChange={(e) =>
                                  f.handleChange(e.target.value)
                                }
                                onBlur={f.handleBlur}
                              />
                            )
                          }
                        </form.AppField>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => (
          <FixedBar
            open={isDirty || activeFieldsDirty}
            leftSlot={
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            }
            title="Modifications non sauvegardées"
            subtitle="Pensez à sauvegarder vos changements"
          >
            <form.AppForm>
              <form.SubmitButton label="Enregistrer">
                <Save size={16} />
              </form.SubmitButton>
            </form.AppForm>
          </FixedBar>
        )}
      </form.Subscribe>
    </form>
  )
}
