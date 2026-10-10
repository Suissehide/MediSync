import { Check, Pencil, Plus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useId, useMemo, useState } from 'react'

import { FilterEditor } from '@/components/custom/indicators/filterEditor.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox, Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '@/components/ui/popup.tsx'
import { Select } from '@/components/ui/select.tsx'
import { useAppForm } from '@/hooks/formConfig.tsx'
import { isApiError } from '@/libs/httpErrorHandler.ts'
import {
  useIndicatorPreviewQuery,
  useIndicatorSetMutations,
} from '@/queries/useIndicatorSet.ts'
import type {
  FilterCondition,
  Indicator,
  IndicatorBody,
  IndicatorDefinition,
  IndicatorInput,
  IndicatorNature,
  IndicatorOptions,
  MeasureCatalogEntry,
} from '@/types/indicatorSet.ts'
import type { ServiceField } from '@/types/serviceField.ts'

export const NATURE_LABELS: Record<IndicatorNature, string> = {
  computed: 'Calculé',
  manual: 'À saisir',
  unavailable: 'Non disponible',
}

export const INPUT_LABELS: Record<IndicatorInput, string> = {
  'number+text': 'Nombre et commentaire',
  yesno: 'Oui / Non',
}

const NATURE_OPTIONS = Object.entries(NATURE_LABELS).map(([value, label]) => ({
  value,
  label,
}))
const INPUT_OPTIONS = Object.entries(INPUT_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export const estChampAChoix = (f: ServiceField) =>
  f.type === 'choice' || f.type === 'multichoice'

type Valeurs = {
  code: string
  label: string
  group: string
  parentId: string
  nature: IndicatorNature
  measure: string
  options: IndicatorOptions
  filters: FilterCondition[]
  breakdownField: string
  input: IndicatorInput
  note: string
}

// Seuls les réglages de la nature choisie partent : les autres retombent à null.
const definitionDe = (v: Valeurs): IndicatorDefinition => {
  const calcule = v.nature === 'computed'
  return {
    nature: v.nature,
    measure: calcule && v.measure ? v.measure : null,
    options: calcule ? v.options : null,
    filters: calcule ? v.filters : null,
    breakdownField: calcule && v.breakdownField ? v.breakdownField : null,
    input: v.nature === 'manual' ? v.input : null,
    note: v.note.trim() || null,
  }
}

const ANNEE = new Date().getFullYear()

function Apercu({
  setId,
  definition,
}: {
  setId: string
  definition: IndicatorDefinition
}) {
  const { data, error, isFetching } = useIndicatorPreviewQuery(
    setId,
    definition,
    `${ANNEE}-01-01`,
    `${ANNEE}-12-31`,
  )
  if (error) {
    return (
      <p className="text-sm text-text-light" aria-live="polite">
        {isApiError(error) && error.status === 400
          ? 'Configuration incomplète'
          : 'Aperçu indisponible'}
      </p>
    )
  }
  if (!data || isFetching) {
    return (
      <p className="text-sm text-text-light" aria-live="polite">
        Calcul de l'aperçu…
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <p className="text-sm font-medium text-foreground">
        Valeur sur {ANNEE} : {data.value ?? '—'}
      </p>
      {data.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-700">
          {w}
        </p>
      ))}
    </div>
  )
}

interface IndicatorFormProps {
  setId: string
  indicators: Indicator[]
  catalog: MeasureCatalogEntry[]
  fields: ServiceField[]
  indicator?: Indicator
  trigger?: React.ReactNode
}

function IndicatorForm({
  setId,
  indicators,
  catalog,
  fields,
  indicator,
  trigger,
}: IndicatorFormProps) {
  const [open, setOpen] = useState(false)
  const groupesId = useId()
  const { createIndicator, updateIndicator } = useIndicatorSetMutations()
  const enCours = indicator
    ? updateIndicator.isPending
    : createIndicator.isPending

  const defaultValues = useMemo<Valeurs>(
    () => ({
      code: indicator?.code ?? '',
      label: indicator?.label ?? '',
      group: indicator?.group ?? '',
      parentId: indicator?.parentId ?? '',
      nature: indicator?.nature ?? 'computed',
      measure: indicator?.measure ?? '',
      options: indicator?.options ?? {},
      filters: indicator?.filters ?? [],
      breakdownField: indicator?.breakdownField ?? '',
      input: indicator?.input ?? 'number+text',
      note: indicator?.note ?? '',
    }),
    [indicator],
  )

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value }) => {
      if (enCours) {
        return
      }
      const body: IndicatorBody = {
        ...definitionDe(value),
        code: value.code.trim(),
        label: value.label.trim(),
        group: value.group.trim(),
        parentId: value.parentId || null,
      }
      const fermer = { onSuccess: () => setOpen(false) }
      if (indicator) {
        updateIndicator.mutate({ setId, id: indicator.id, body }, fermer)
      } else {
        createIndicator.mutate({ setId, body }, fermer)
      }
    },
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  const groupes = [...new Set(indicators.map((i) => i.group))]
  // Ni lui-même ni ses descendants : le back refuserait le cycle.
  const exclus = new Set(indicator ? [indicator.id] : [])
  for (let ajout = true; ajout; ) {
    ajout = false
    for (const i of indicators) {
      if (i.parentId && exclus.has(i.parentId) && !exclus.has(i.id)) {
        exclus.add(i.id)
        ajout = true
      }
    }
  }
  const parents = indicators
    .filter((i) => !i.archived && !exclus.has(i.id))
    .map((i) => ({ value: i.id, label: `${i.code} · ${i.label}` }))
  const requis = (nom: string) => ({
    onSubmit: ({ value }: { value: string }) =>
      value.trim() ? undefined : `${nom} est nécessaire`,
  })

  return (
    <Popup modal={true} open={open} onOpenChange={setOpen}>
      <PopupTrigger asChild>
        {trigger ??
          (indicator ? (
            <Button variant="outline" size="sm">
              <Pencil className="w-4 h-4" />
              Modifier
            </Button>
          ) : (
            <Button variant="default">
              <Plus className="w-4 h-4" />
              Ajouter un indicateur
            </Button>
          ))}
      </PopupTrigger>

      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            {indicator ? "Modifier l'indicateur" : 'Ajouter un indicateur'}
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="space-y-4 max-w-xl"
          >
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <form.AppField name="code" validators={requis('Le code')}>
                {(f) => <f.Input label="Code" />}
              </form.AppField>
              <form.AppField name="label" validators={requis('Le libellé')}>
                {(f) => <f.Input label="Libellé" />}
              </form.AppField>
            </div>

            <form.Field name="group" validators={requis('Le groupe')}>
              {(f) => (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="group">Groupe</Label>
                  <Input
                    id="group"
                    list={groupesId}
                    value={f.state.value}
                    placeholder="Groupe existant ou nouveau"
                    onChange={(e) => f.handleChange(e.target.value)}
                  />
                  <datalist id={groupesId}>
                    {groupes.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  {f.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {f.state.meta.errors.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.AppField name="parentId">
              {(f) => (
                <f.Select
                  label="Parent (facultatif)"
                  options={parents}
                  placeholder="Aucun"
                />
              )}
            </form.AppField>

            <form.AppField name="nature">
              {(f) => (
                <f.Select
                  label="Nature"
                  options={NATURE_OPTIONS}
                  clearable={false}
                />
              )}
            </form.AppField>

            <form.Subscribe selector={(state) => state.values}>
              {(values) => {
                const mesure = catalog.find((m) => m.key === values.measure)
                return (
                  <>
                    {values.nature === 'computed' && (
                      <>
                        <form.AppField
                          name="measure"
                          listeners={{
                            onChange: ({ value }) => {
                              form.setFieldValue('options', {})
                              const unite = catalog.find(
                                (m) => m.key === value,
                              )?.unit
                              if (unite !== 'patients') {
                                form.setFieldValue('breakdownField', '')
                              }
                            },
                          }}
                        >
                          {(f) => (
                            <f.Select
                              label="Mesure"
                              options={catalog.map((m) => ({
                                value: m.key,
                                label: m.label,
                              }))}
                              clearable={false}
                              description={mesure?.description}
                            />
                          )}
                        </form.AppField>

                        {mesure?.options.map((option) => {
                          const id = `option-${option.name}`
                          const courant = values.options[option.name]
                          const changer = (v: string | boolean) =>
                            form.setFieldValue('options', {
                              ...values.options,
                              [option.name]: v,
                            })
                          return option.kind === 'boolean' ? (
                            <div
                              key={option.name}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={id}
                                checked={courant === true}
                                onChange={(e) => changer(e.target.checked)}
                              />
                              <Label htmlFor={id}>{option.label}</Label>
                            </div>
                          ) : (
                            <div
                              key={option.name}
                              className="flex flex-col gap-1"
                            >
                              <Label htmlFor={id}>{option.label}</Label>
                              <Select
                                id={id}
                                options={option.choices ?? []}
                                value={
                                  typeof courant === 'string' ? courant : ''
                                }
                                clearable={false}
                                onValueChange={changer}
                              />
                            </div>
                          )
                        })}

                        <FilterEditor
                          fields={fields}
                          value={values.filters}
                          onChange={(filters) =>
                            form.setFieldValue('filters', filters)
                          }
                        />

                        {mesure?.unit === 'patients' && (
                          <form.AppField name="breakdownField">
                            {(f) => (
                              <f.Select
                                label="Répartition (facultative)"
                                options={fields
                                  .filter(
                                    (c) =>
                                      estChampAChoix(c) &&
                                      (!c.archived ||
                                        c.key === values.breakdownField),
                                  )
                                  .map((c) => ({
                                    value: c.key,
                                    label: c.label,
                                  }))}
                                placeholder="Aucune"
                              />
                            )}
                          </form.AppField>
                        )}
                      </>
                    )}

                    {values.nature === 'manual' && (
                      <form.AppField name="input">
                        {(f) => (
                          <f.Select
                            label="Type de réponse"
                            options={INPUT_OPTIONS}
                            clearable={false}
                          />
                        )}
                      </form.AppField>
                    )}

                    {values.nature !== 'computed' && (
                      <form.AppField name="note">
                        {(f) => (
                          <f.TextArea
                            label="Note"
                            description={
                              values.nature === 'unavailable'
                                ? 'Affichée à la place de la valeur'
                                : 'Affichée tant que la réponse manque'
                            }
                          />
                        )}
                      </form.AppField>
                    )}

                    {values.nature === 'computed' && (
                      <Apercu setId={setId} definition={definitionDe(values)} />
                    )}
                  </>
                )
              }}
            </form.Subscribe>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            isLoading={enCours}
            disabled={enCours}
            onClick={() => form.handleSubmit()}
          >
            <Check className="w-4 h-4" />
            {indicator ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default IndicatorForm
