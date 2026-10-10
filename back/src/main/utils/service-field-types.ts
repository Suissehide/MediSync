import Boom from '@hapi/boom'

import type { Prisma } from '../../generated/client'

export const SERVICE_FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'date',
  'choice',
  'multichoice',
  'boolean',
] as const
export type ServiceFieldType = (typeof SERVICE_FIELD_TYPES)[number]

export const SERVICE_FIELD_SECTIONS = ['pathway', 'outcome'] as const
export type ServiceFieldSection = (typeof SERVICE_FIELD_SECTIONS)[number]

export type FieldValues = Record<string, unknown>

export type FieldDefinitionForValidation = {
  key: string
  type: ServiceFieldType
  clinical: boolean
  archivedAt: Date | null
  choices: { key: string; archivedAt: Date | null }[]
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// Refuse aussi un jour qui n'existe pas (2026-02-30), que Date reporterait au mois suivant.
const isIsoDay = (value: unknown): boolean => {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    return false
  }
  const day = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value)
}

// Un choix archivé reste acceptable s'il est déjà la valeur en base : réenregistrer un vieux dossier ne doit pas échouer.
const isUsableChoice = (
  def: FieldDefinitionForValidation,
  key: unknown,
  previous: unknown,
): boolean => {
  const choice = def.choices.find((c) => c.key === key)
  if (!choice) {
    return false
  }
  if (choice.archivedAt === null) {
    return true
  }
  return Array.isArray(previous) ? previous.includes(key) : previous === key
}

const VALIDATORS: Record<
  ServiceFieldType,
  (
    value: unknown,
    def: FieldDefinitionForValidation,
    previous: unknown,
  ) => boolean
> = {
  text: (v) => typeof v === 'string',
  longtext: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  date: isIsoDay,
  boolean: (v) => typeof v === 'boolean',
  choice: (v, def, previous) => isUsableChoice(def, v, previous),
  multichoice: (v, def, previous) =>
    Array.isArray(v) &&
    new Set(v).size === v.length &&
    v.every((k) => isUsableChoice(def, k, previous)),
}

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

// Applique un correctif partiel : clé présente = remplacée, vide = effacée, clé absente = inchangée.
export const mergeFieldPatch = (
  definitions: readonly FieldDefinitionForValidation[],
  current: FieldValues,
  patch: Record<string, unknown>,
  clinical: boolean,
): FieldValues => {
  const byKey = new Map(definitions.map((d) => [d.key, d]))
  const next: FieldValues = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const def = byKey.get(key)
    if (!def) {
      throw Boom.badRequest(`Champ inconnu : ${key}`)
    }
    if (def.archivedAt !== null) {
      throw Boom.badRequest(`Champ archivé : ${key}`)
    }
    if (def.clinical !== clinical) {
      throw Boom.badRequest(
        `Champ rangé dans la mauvaise colonne (clinique) : ${key}`,
      )
    }
    if (isEmpty(value)) {
      delete next[key]
      continue
    }
    if (!VALIDATORS[def.type](value, def, current[key])) {
      throw Boom.badRequest(`Valeur invalide pour ${key}`)
    }
    next[key] = value
  }
  return next
}

const words = (label: string): string[] =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

const withSuffix = (
  base: string,
  taken: ReadonlySet<string>,
  sep: string,
): string => {
  if (!taken.has(base)) {
    return base
  }
  let n = 2
  while (taken.has(`${base}${sep}${n}`)) {
    n++
  }
  return `${base}${sep}${n}`
}

export const fieldKeyFromLabel = (
  label: string,
  taken: ReadonlySet<string>,
): string => {
  const camel = words(label)
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('')
  const base =
    camel === ''
      ? 'champ'
      : /^[0-9]/.test(camel)
        ? `champ${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
        : camel
  return withSuffix(base, taken, '')
}

export const choiceKeyFromLabel = (
  label: string,
  taken: ReadonlySet<string>,
): string => {
  const base = words(label).join('_').toUpperCase() || 'CHOIX'
  return withSuffix(base, taken, '_')
}

// Lit une valeur texte d'une colonne JSON de valeurs ; null si absente ou d'un autre type.
export const readChoice = (values: unknown, key: string): string | null => {
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    return null
  }
  const value: unknown = Reflect.get(values, key)
  return typeof value === 'string' ? value : null
}

// Lit une colonne JSON de valeurs ; {} si elle n'est pas un objet.
export const asValues = (json: unknown): FieldValues =>
  typeof json === 'object' && json !== null && !Array.isArray(json)
    ? { ...json }
    : {}

const isJsonValue = (value: unknown): value is Prisma.JsonValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every(isJsonValue)) ||
  (typeof value === 'object' && Object.values(value).every(isJsonValue))

// Type les valeurs fusionnées pour Prisma ; elles sont déjà validées, rien n'est écarté en pratique.
export const toJsonObject = (values: FieldValues): Prisma.JsonObject =>
  Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, Prisma.JsonValue] => isJsonValue(entry[1]),
    ),
  )

export const asFieldType = (type: string): ServiceFieldType | undefined =>
  SERVICE_FIELD_TYPES.find((t) => t === type)
