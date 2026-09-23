import type {
  Pathway,
  PathwayTemplate,
  Prisma,
  Slot,
} from '../../../../../generated/client'
import type { SlotWithTemplateAndAppointmentsRepo } from './slot.repository.interface'

export type PathwayEntityRepo = Pathway
export type PathwayWithTemplateAndSlotsRepo = PathwayEntityRepo & {
  template: PathwayTemplate | null
  slots: Slot[]
}
export type PathwayWithSlotsRepo = PathwayEntityRepo & {
  slots: SlotWithTemplateAndAppointmentsRepo[]
}
// Le repository pose serviceId/establishmentId (tenant) lui-même. Le
// `connect` composite sur `template` n'est pas utilisé (cohérence de
// service vérifiée par le domaine, tâche 14) : la relation brute `template`
// est donc omise au profit du seul scalaire `templateID`. `slots` est
// remplacé par `slotIDs`, converti en `connect` par clé composite dans le
// repository.
export type PathwayCreateEntityRepo = Omit<
  Prisma.PathwayUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slots' | 'template'
> & {
  slotIDs: string[]
  templateID?: string
}
export type PathwayUpdateEntityRepo = Omit<
  Prisma.PathwayUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'slots' | 'template'
>

export type RegeneratePathwaysResultRepo = {
  pathwaysUpdated: number
  slotsDeleted: number
  slotsKept: number
  slotsCreated: number
}

export type TrackingAppointmentRepo = {
  date: Date
  status: string | null
}
export type TrackingPatientRepo = {
  id: string
  firstName: string
  lastName: string
  appointments: TrackingAppointmentRepo[]
}
export type TrackingPathwayRepo = {
  id: string
  startDate: Date
  endDate: Date | null
  template: {
    id: string
    name: string
    color: string
    mainTag: string
    secondaryTags: string[]
  } | null
  patients: TrackingPatientRepo[]
}

export interface PathwayRepositoryInterface {
  findAll: () => Promise<PathwayWithTemplateAndSlotsRepo[]>
  findByID: (pathwayID: string) => Promise<PathwayEntityRepo>
  findByTemplateIDAndDate: (
    pathwayTemplateID: string,
    startDate: Date,
  ) => Promise<PathwayWithSlotsRepo[]>
  findByTemplateTagAndDate: (
    tag: string,
    startDate: Date,
  ) => Promise<PathwayWithSlotsRepo[]>
  findByTemplateTagWithFutureSlots: (
    tag: string,
    date: Date,
  ) => Promise<PathwayWithSlotsRepo[]>
  findTracking: (year: number, month: number) => Promise<TrackingPathwayRepo[]>
  create: (
    pathwayCreateParams: PathwayCreateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  delete: (pathwayID: string) => Promise<PathwayEntityRepo>
  regenerate: (
    pathwayTemplateID: string,
    fromDate: Date,
  ) => Promise<RegeneratePathwaysResultRepo>
}
