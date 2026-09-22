import { Prisma } from '../../../generated/client'
import type {
  TenantContextInterface,
  TenantStore,
} from '../../types/utils/tenant-context'
import { TenantScopeMissingError } from '../../utils/tenant-errors'

// Modèles rattachés à un service : portent serviceId ET establishmentId.
export const SERVICE_MODELS: readonly string[] = [
  'PathwayTemplate',
  'SlotTemplate',
  'Pathway',
  'Slot',
  'Appointment',
  'AppointmentPatient',
  'Thematic',
  'DiagnosticEducatifTemplate',
  'DiagnosticEducatif',
  'EnrollmentIssue',
  'PatientPathwayPriority',
  'ForbiddenWeek',
  'PlanningCycle',
  'Todo',
  'SlotTemplateSoignant',
  'SoignantThematic',
]

// Modèles rattachés à un établissement : portent establishmentId.
export const ESTABLISHMENT_MODELS: readonly string[] = [
  'Patient',
  'Soignant',
  'Location',
  'Service',
  'EstablishmentMembership',
  'ServiceMembership',
  'ActivityLog',
]

// Relations dont les créations imbriquées sont vérifiées (parent → champ → enfant).
const NESTED_RELATIONS: Record<string, Record<string, string>> = {
  Appointment: { appointmentPatients: 'AppointmentPatient' },
  Slot: { appointments: 'Appointment' },
  Pathway: { slots: 'Slot' },
  PathwayTemplate: { slotTemplates: 'SlotTemplate' },
  SlotTemplate: { soignantLinks: 'SlotTemplateSoignant', slot: 'Slot' },
  Thematic: { soignantLinks: 'SoignantThematic' },
  Soignant: { slotTemplateLinks: 'SlotTemplateSoignant', thematicLinks: 'SoignantThematic' },
  EstablishmentMembership: { serviceMemberships: 'ServiceMembership' },
  Patient: { appointmentPatients: 'AppointmentPatient', diagnostics: 'DiagnosticEducatif' },
}

const READ_OPERATIONS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert', 'count', 'aggregate', 'groupBy',
])
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'upsert'])

type Family = 'service' | 'establishment' | 'global'

const familyOf = (model: string): Family => {
  if (SERVICE_MODELS.includes(model)) {
    return 'service'
  }
  if (ESTABLISHMENT_MODELS.includes(model)) {
    return 'establishment'
  }
  return 'global'
}

type Dict = Record<string, unknown>
const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

// Lit `field` au premier niveau du where, ou dans une clé composite `id_<field>`.
const whereValue = (where: unknown, field: string): unknown => {
  if (!isDict(where)) {
    return undefined
  }
  if (field in where) {
    return where[field]
  }
  const composite = where[`id_${field}`]
  return isDict(composite) ? composite[field] : undefined
}

const expectedValue = (store: TenantStore, field: string, model: string, operation: string): string => {
  if (store.kind !== 'tenant') {
    throw new TenantScopeMissingError(model, operation, field)
  }
  const value = field === 'serviceId' ? store.tenant.serviceId : store.tenant.establishmentId
  if (value === null) {
    throw new TenantScopeMissingError(model, operation, field)
  }
  return value
}

const assertWhere = (model: string, operation: string, args: Dict, field: string, store: TenantStore): void => {
  const expected = expectedValue(store, field, model, operation)
  if (whereValue(args.where, field) !== expected) {
    throw new TenantScopeMissingError(model, operation, field)
  }
}

// Vérifie que `row` porte les colonnes de tenant attendues pour son modèle.
const assertRowScope = (model: string, operation: string, row: Dict, store: TenantStore): void => {
  const family = familyOf(model)
  if (family === 'service' && row.serviceId !== expectedValue(store, 'serviceId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (family !== 'global' && row.establishmentId !== expectedValue(store, 'establishmentId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'establishmentId')
  }
}

// Redescend dans les créations imbriquées déclarées par NESTED_RELATIONS.
const assertNestedRelations = (model: string, operation: string, row: Dict, store: TenantStore): void => {
  const relations = NESTED_RELATIONS[model] ?? {}
  for (const [relationField, childModel] of Object.entries(relations)) {
    const relation = row[relationField]
    if (!isDict(relation)) {
      continue
    }
    if ('create' in relation) {
      assertData(childModel, `${operation}>${relationField}.create`, relation.create, store)
    }
    if (isDict(relation.createMany) && 'data' in relation.createMany) {
      assertData(childModel, `${operation}>${relationField}.createMany`, relation.createMany.data, store)
    }
  }
}

const assertData = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (!isDict(row)) {
      throw new TenantScopeMissingError(model, operation, 'data')
    }
    assertRowScope(model, operation, row, store)
    assertNestedRelations(model, operation, row, store)
  }
}

// Vérifie qu'une opération Prisma porte le filtre de tenant attendu.
// Pure : testable sans client Prisma.
export const assertTenantScope = (
  input: { model: string; operation: string; args: Dict },
  store: TenantStore | undefined,
): void => {
  const { model, operation, args } = input
  const family = familyOf(model)
  if (family === 'global') {
    return
  }
  if (!store) {
    throw new TenantScopeMissingError(model, operation, 'context')
  }
  if (store.kind === 'system') {
    return
  }
  const field = family === 'service' ? 'serviceId' : 'establishmentId'
  if (READ_OPERATIONS.has(operation)) {
    assertWhere(model, operation, args, field, store)
  }
  if (WRITE_OPERATIONS.has(operation)) {
    const data = operation === 'upsert' ? args.create : args.data
    assertData(model, operation, data, store)
  }
}

export const buildTenantGuardExtension = (tenantContext: TenantContextInterface) =>
  Prisma.defineExtension({
    name: 'tenantGuard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          assertTenantScope(
            { model, operation, args: args as Dict },
            tenantContext.peek(),
          )
          return query(args)
        },
      },
    },
  })
