import type {
  Pathway,
  Prisma,
} from '../../../../../../prisma/generated/prisma/client'
import type { SlotWithTemplateAndAppointmentsRepo } from './slot.repository.interface'

export type PathwayEntityRepo = Pathway
export type PathwayWithSlotsRepo = PathwayEntityRepo & {
  slots: SlotWithTemplateAndAppointmentsRepo[]
}
export type PathwayCreateEntityRepo = Prisma.PathwayUncheckedCreateInput & {
  slotIDs: string[]
  templateID?: string
}
export type PathwayUpdateEntityRepo = Prisma.PathwayUncheckedUpdateInput

export interface PathwayRepositoryInterface {
  findAll: () => Promise<PathwayEntityRepo[]>
  findByID: (pathwayID: string) => Promise<PathwayEntityRepo>
  findByTemplateIDAndDate: (
    pathwayTemplateID: string,
    startDate: Date,
  ) => Promise<PathwayWithSlotsRepo[]>
  create: (
    pathwayCreateParams: PathwayCreateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  update: (
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ) => Promise<PathwayEntityRepo>
  delete: (pathwayID: string) => Promise<PathwayEntityRepo>
}
