import { z } from 'zod/v4'

import {
  SERVICE_FIELD_SECTIONS,
  SERVICE_FIELD_TYPES,
} from '../../../../utils/service-field-types'

// Aplatit `archivedAt` en `archived: boolean`, comme le fait déjà
// `thematicNameFromRelation` pour une autre relation (schemas/index.ts).
const serviceFieldChoiceResponseSchema = z
  .object({
    id: z.cuid(),
    key: z.string(),
    label: z.string(),
    order: z.number(),
    archivedAt: z.date().nullable(),
  })
  .transform(({ archivedAt, ...choice }) => ({
    ...choice,
    archived: archivedAt !== null,
  }))

export const serviceFieldResponseSchema = z
  .object({
    id: z.cuid(),
    key: z.string(),
    label: z.string(),
    type: z.enum(SERVICE_FIELD_TYPES),
    section: z.enum(SERVICE_FIELD_SECTIONS),
    order: z.number(),
    clinical: z.boolean(),
    unit: z.string().nullable(),
    archivedAt: z.date().nullable(),
    choices: z.array(serviceFieldChoiceResponseSchema),
  })
  .transform(({ archivedAt, ...field }) => ({
    ...field,
    archived: archivedAt !== null,
  }))

export const serviceFieldsResponseSchema = z.array(serviceFieldResponseSchema)

export const getServiceFieldByIdParamsSchema = z.object({
  fieldID: z.cuid(),
})

export const createServiceFieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  type: z.enum(SERVICE_FIELD_TYPES),
  section: z.enum(SERVICE_FIELD_SECTIONS),
  clinical: z.boolean().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  choices: z.array(z.string().trim().min(1).max(120)).optional(),
})

export const updateServiceFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()

export const updateServiceFieldByIdSchema = {
  params: getServiceFieldByIdParamsSchema,
  body: updateServiceFieldSchema,
}

export const createServiceFieldChoiceSchema = z.object({
  label: z.string().trim().min(1).max(120),
})

export const createServiceFieldChoiceByIdSchema = {
  params: getServiceFieldByIdParamsSchema,
  body: createServiceFieldChoiceSchema,
}

export const updateServiceFieldChoiceSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .strict()

export const getServiceFieldChoiceParamsSchema = z.object({
  fieldID: z.cuid(),
  choiceID: z.cuid(),
})

export const updateServiceFieldChoiceByIdSchema = {
  params: getServiceFieldChoiceParamsSchema,
  body: updateServiceFieldChoiceSchema,
}

export const reorderServiceFieldsSchema = z.object({
  section: z.enum(SERVICE_FIELD_SECTIONS),
  ids: z.array(z.cuid()),
})

export const reorderServiceFieldChoicesSchema = z.object({
  ids: z.array(z.cuid()),
})

export const reorderServiceFieldChoicesByIdSchema = {
  params: getServiceFieldByIdParamsSchema,
  body: reorderServiceFieldChoicesSchema,
}

export type GetServiceFieldByIdParams = z.infer<
  typeof getServiceFieldByIdParamsSchema
>
export type CreateServiceFieldBody = z.infer<typeof createServiceFieldSchema>
export type UpdateServiceFieldParams = z.infer<
  typeof updateServiceFieldByIdSchema.params
>
export type UpdateServiceFieldBody = z.infer<
  typeof updateServiceFieldByIdSchema.body
>
export type CreateServiceFieldChoiceBody = z.infer<
  typeof createServiceFieldChoiceSchema
>
export type ServiceFieldChoiceParams = z.infer<
  typeof getServiceFieldChoiceParamsSchema
>
export type UpdateServiceFieldChoiceBody = z.infer<
  typeof updateServiceFieldChoiceByIdSchema.body
>
export type ReorderServiceFieldsBody = z.infer<
  typeof reorderServiceFieldsSchema
>
export type ReorderServiceFieldChoicesBody = z.infer<
  typeof reorderServiceFieldChoicesSchema
>
