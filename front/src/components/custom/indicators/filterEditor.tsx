import dayjs from 'dayjs'
import { Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useId, useRef } from 'react'

import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import type { FilterCondition, FilterOp } from '@/types/indicatorSet.ts'
import type { ServiceField, ServiceFieldType } from '@/types/serviceField.ts'

// Miroir de `OPERATORS_BY_TYPE` (back/src/main/utils/indicators/filters.ts) : texte libre non filtrable.
export const OPERATEURS: Record<
  ServiceFieldType,
  { op: FilterOp; label: string }[]
> = {
  text: [],
  longtext: [],
  choice: [{ op: 'in', label: 'parmi' }],
  multichoice: [{ op: 'containsAny', label: "contient l'un de" }],
  boolean: [{ op: 'eq', label: 'est' }],
  number: [
    { op: 'eq', label: '=' },
    { op: 'lt', label: '<' },
    { op: 'lte', label: '≤' },
    { op: 'gt', label: '>' },
    { op: 'gte', label: '≥' },
  ],
  date: [
    { op: 'before', label: 'avant le' },
    { op: 'after', label: 'après le' },
  ],
}

const OPS_NOMBRE = ['eq', 'lt', 'lte', 'gt', 'gte'] as const
const OPS_DATE = ['before', 'after'] as const
const estOpNombre = (op: string): op is (typeof OPS_NOMBRE)[number] =>
  OPS_NOMBRE.some((o) => o === op)
const estOpDate = (op: string): op is (typeof OPS_DATE)[number] =>
  OPS_DATE.some((o) => o === op)

export const filtrable = (field: ServiceField) =>
  OPERATEURS[field.type].length > 0

const conditionVide = (field: ServiceField): FilterCondition => {
  switch (field.type) {
    case 'multichoice':
      return { field: field.key, op: 'containsAny', value: [] }
    case 'boolean':
      return { field: field.key, op: 'eq', value: true }
    case 'number':
      return { field: field.key, op: 'eq', value: 0 }
    case 'date':
      return { field: field.key, op: 'before', value: '' }
    default:
      return { field: field.key, op: 'in', value: [] }
  }
}

const libelleOp = (field: ServiceField | undefined, op: FilterOp) =>
  (field ? OPERATEURS[field.type] : []).find((o) => o.op === op)?.label ?? op

// « Orientation parmi Hors hôpital, Domicile » : la ligne lisible d'un filtre.
export const resumeFiltre = (
  cond: FilterCondition,
  fields: ServiceField[],
): string => {
  const field = fields.find((f) => f.key === cond.field)
  const nom = field?.label ?? cond.field
  if (Array.isArray(cond.value)) {
    const libelles = cond.value.map(
      (k) => field?.choices.find((c) => c.key === k)?.label ?? k,
    )
    return `${nom} ${libelleOp(field, cond.op)} ${libelles.join(', ')}`
  }
  if (typeof cond.value === 'boolean') {
    return `${nom} : ${cond.value ? 'Oui' : 'Non'}`
  }
  if (typeof cond.value === 'number') {
    return `${nom} ${libelleOp(field, cond.op)} ${cond.value}`
  }
  return `${nom} ${libelleOp(field, cond.op)} ${dayjs(cond.value).format('DD/MM/YYYY')}`
}

type ValeurProps = {
  id: string
  field: ServiceField
  cond: FilterCondition
  onChange: (cond: FilterCondition) => void
}

function ValeurChoix({ field, cond, onChange }: ValeurProps) {
  const coches = Array.isArray(cond.value) ? cond.value : []
  const op = field.type === 'choice' ? 'in' : 'containsAny'
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
      <legend className="sr-only">Valeurs</legend>
      {field.choices
        .filter((c) => !c.archived || coches.includes(c.key))
        .map((c) => (
          <label
            key={c.key}
            className="flex items-center gap-1.5 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className="accent-primary"
              checked={coches.includes(c.key)}
              onChange={(e) =>
                onChange({
                  field: field.key,
                  op,
                  value: e.target.checked
                    ? [...coches, c.key]
                    : coches.filter((k) => k !== c.key),
                })
              }
            />
            {c.label}
          </label>
        ))}
    </fieldset>
  )
}

function ValeurBooleen({ id, field, cond, onChange }: ValeurProps) {
  return (
    <>
      <Label htmlFor={`${id}-valeur`} className="sr-only">
        Valeur
      </Label>
      <Select
        id={`${id}-valeur`}
        options={[
          { value: 'true', label: 'Oui' },
          { value: 'false', label: 'Non' },
        ]}
        value={cond.value === false ? 'false' : 'true'}
        clearable={false}
        onValueChange={(v) =>
          onChange({ field: field.key, op: 'eq', value: v === 'true' })
        }
      />
    </>
  )
}

function SelectOperateur({
  id,
  type,
  value,
  onChange,
}: {
  id: string
  type: ServiceFieldType
  value: FilterOp
  onChange: (op: string) => void
}) {
  return (
    <>
      <Label htmlFor={`${id}-op`} className="sr-only">
        Opérateur
      </Label>
      <Select
        id={`${id}-op`}
        options={OPERATEURS[type].map((o) => ({ value: o.op, label: o.label }))}
        value={value}
        clearable={false}
        onValueChange={onChange}
      />
    </>
  )
}

function ValeurNombre({ id, field, cond, onChange }: ValeurProps) {
  const op = estOpNombre(cond.op) ? cond.op : 'eq'
  const n = typeof cond.value === 'number' ? cond.value : 0
  return (
    <div className="flex gap-2">
      <SelectOperateur
        id={id}
        type="number"
        value={op}
        onChange={(v) => {
          if (estOpNombre(v)) {
            onChange({ field: field.key, op: v, value: n })
          }
        }}
      />
      <Input
        type="number"
        aria-label="Valeur"
        value={n}
        onChange={(e) =>
          onChange({ field: field.key, op, value: Number(e.target.value) })
        }
      />
    </div>
  )
}

function ValeurDate({ id, field, cond, onChange }: ValeurProps) {
  const op = estOpDate(cond.op) ? cond.op : 'before'
  const jour = typeof cond.value === 'string' ? cond.value : ''
  return (
    <div className="flex gap-2">
      <SelectOperateur
        id={id}
        type="date"
        value={op}
        onChange={(v) => {
          if (estOpDate(v)) {
            onChange({ field: field.key, op: v, value: jour })
          }
        }}
      />
      <Input
        type="date"
        aria-label="Date"
        value={jour}
        onChange={(e) =>
          onChange({ field: field.key, op, value: e.target.value })
        }
      />
    </div>
  )
}

const VALEURS: Partial<
  Record<ServiceFieldType, (props: ValeurProps) => React.ReactNode>
> = {
  choice: ValeurChoix,
  multichoice: ValeurChoix,
  boolean: ValeurBooleen,
  number: ValeurNombre,
  date: ValeurDate,
}

interface LigneProps {
  cond: FilterCondition
  fields: ServiceField[]
  onChange: (cond: FilterCondition) => void
  onRemove: () => void
}

function LigneFiltre({ cond, fields, onChange, onRemove }: LigneProps) {
  const id = useId()
  const field = fields.find((f) => f.key === cond.field)
  const Valeur = field ? VALEURS[field.type] : undefined
  const operateurs = field ? OPERATEURS[field.type] : []
  // Un champ archivé déjà filtré reste visible ; on n'en propose pas de nouveau.
  const proposes = fields.filter(
    (f) => filtrable(f) && (!f.archived || f.key === cond.field),
  )

  return (
    <li className="flex flex-col gap-2 border border-border rounded px-3 py-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <Label htmlFor={`${id}-champ`}>Champ</Label>
          <Select
            id={`${id}-champ`}
            options={proposes.map((f) => ({ value: f.key, label: f.label }))}
            value={cond.field}
            clearable={false}
            onValueChange={(key) => {
              const choisi = fields.find((f) => f.key === key)
              if (choisi) {
                onChange(conditionVide(choisi))
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Retirer le filtre"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      {operateurs.length === 1 && (
        <span className="text-sm text-text-light">{operateurs[0].label}</span>
      )}
      {field && Valeur && (
        <Valeur id={id} field={field} cond={cond} onChange={onChange} />
      )}
    </li>
  )
}

interface FilterEditorProps {
  fields: ServiceField[]
  value: FilterCondition[]
  onChange: (value: FilterCondition[]) => void
}

export function FilterEditor({ fields, value, onChange }: FilterEditorProps) {
  const premier = fields.find((f) => filtrable(f) && !f.archived)
  // Une clé par ligne, tenue à côté de la liste : les conditions n'ont pas d'identifiant.
  const cles = useRef<string[]>([])
  while (cles.current.length < value.length) {
    cles.current.push(crypto.randomUUID())
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Filtres</Label>
      {value.length > 0 && (
        <ul className="flex flex-col gap-2">
          {value.map((cond, index) => (
            <LigneFiltre
              key={cles.current[index]}
              cond={cond}
              fields={fields}
              onChange={(c) =>
                onChange(value.map((v, i) => (i === index ? c : v)))
              }
              onRemove={() => {
                cles.current.splice(index, 1)
                onChange(value.filter((_, i) => i !== index))
              }}
            />
          ))}
        </ul>
      )}
      {premier ? (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => onChange([...value, conditionVide(premier)])}
        >
          <Plus className="w-4 h-4" />
          Ajouter un filtre
        </Button>
      ) : (
        <p className="text-sm text-text-light">
          Aucun champ filtrable dans la fiche patient
        </p>
      )}
    </div>
  )
}
