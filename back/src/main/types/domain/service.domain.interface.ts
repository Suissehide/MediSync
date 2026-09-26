import type { Service } from '../../../generated/client'

export type ServiceEntityDomain = Service
export type ServiceCreateEntityDomain = {
  name: string
}
export type ServiceUpdateEntityDomain = {
  name?: string
  deactivated?: boolean
}

// Décision 3.6 (spec §3.6) : ce que rend l'écran avant de désactiver — voir
// `PatientServiceFileDeactivationImpactRepo` (types/infra/orm/repositories/
// patientServiceFile.repository.interface.ts) pour ce que chaque nombre signifie.
export type ServiceDeactivationImpactDomain = {
  suivisIci: number
  suivisNullePartAilleurs: number
}

export interface ServiceDomainInterface {
  findAll: () => Promise<ServiceEntityDomain[]>
  create: (
    serviceCreateParams: ServiceCreateEntityDomain,
  ) => Promise<ServiceEntityDomain>
  update: (
    serviceID: string,
    serviceUpdateParams: ServiceUpdateEntityDomain,
  ) => Promise<ServiceEntityDomain>
  impactDesactivation: (
    serviceID: string,
  ) => Promise<ServiceDeactivationImpactDomain>
}
