export type Pathway = {
  id: string
  startDate: string
  pathwayTemplateID?: string
}

export type CreatePathwayParams = Pick<Pathway, 'startDate'>
export type InstantiatePathwayParams = Pick<
  Pathway,
  'startDate' | 'pathwayTemplateID'
>
export type UpdatePathwayParams = Pick<Pathway, 'id' | 'startDate'>
