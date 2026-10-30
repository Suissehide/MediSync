import { z } from 'zod/v4'

import { CATEGORY_DATE_FIELDS } from '../../../../utils/service-field-types'
import { cuid } from './id.schema'

export const serviceFieldCategoryResponseSchema = z.object({
  id: cuid(),
  label: z.string(),
  order: z.number(),
  dateField: z.enum(CATEGORY_DATE_FIELDS).nullable(),
  archived: z.boolean(),
})

export const serviceFieldCategoriesResponseSchema = z.array(
  serviceFieldCategoryResponseSchema,
)

export const getServiceFieldCategoryByIdParamsSchema = z.object({
  categoryID: cuid(),
})

export const createServiceFieldCategorySchema = z.object({
  label: z.string().trim().min(1).max(120),
})

export const updateServiceFieldCategorySchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .strict()

export const updateServiceFieldCategoryByIdSchema = {
  params: getServiceFieldCategoryByIdParamsSchema,
  body: updateServiceFieldCategorySchema,
}

export const reorderServiceFieldCategoriesSchema = z.object({
  ids: z.array(cuid()),
})

export type CreateServiceFieldCategoryBody = z.infer<
  typeof createServiceFieldCategorySchema
>
export type UpdateServiceFieldCategoryParams = z.infer<
  typeof updateServiceFieldCategoryByIdSchema.params
>
export type UpdateServiceFieldCategoryBody = z.infer<
  typeof updateServiceFieldCategoryByIdSchema.body
>
export type ReorderServiceFieldCategoriesBody = z.infer<
  typeof reorderServiceFieldCategoriesSchema
>
