export type Pathway = {
  id: string
  startDate: string
  pathwayTemplateID?: string
  template?: {
    id: string
    name: string
    color: string
  } | null
  slots?: {
    id: string
    startDate: string
    endDate: string
  }[]
}

export type CreatePathwayParams = Pick<Pathway, 'startDate'>
export type InstantiatePathwayParams = Pick<
  Pathway,
  'startDate' | 'pathwayTemplateID'
>
export type UpdatePathwayParams = Pick<Pathway, 'id' | 'startDate'>

export type TrackingAppointment = {
  date: string
  status: string | null
}

export type TrackingPatient = {
  id: string
  firstName: string
  lastName: string
  appointments: TrackingAppointment[]
}

export type TrackingPathway = {
  id: string
  startDate: string
  endDate: string | null
  template: {
    id: string
    name: string
    color: string
    tags: string[]
  } | null
  patients: TrackingPatient[]
}
