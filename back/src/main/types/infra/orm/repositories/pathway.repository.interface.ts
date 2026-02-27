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
export type PathwayCreateEntityRepo = Prisma.PathwayUncheckedCreateInput & {
  slotIDs: string[]
  templateID?: string
}
export type PathwayUpdateEntityRepo = Prisma.PathwayUncheckedUpdateInput

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
  template: {
    id: string
    name: string
    color: string
    tags: string[]
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
  findTracking: (
    year: number,
    month: number,
  ) => Promise<TrackingPathwayRepo[]>
  create: (
    pathwayCreateParams: PathwayCreateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  delete: (pathwayID: string) => Promise<PathwayEntityRepo>
}
