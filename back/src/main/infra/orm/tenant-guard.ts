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
  'PatientServiceFile',
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

// Relations dont les écritures imbriquées sont vérifiées (parent → champ → enfant). C'est une
// liste blanche qui EXIGE : toute écriture imbriquée sur une relation absente d'ici est refusée
// (voir assertNestedRelations), plutôt que laissée sans contrôle. Contrairement à
// TENANT_CHILD_RELATIONS, elle n'a pas à être exhaustive : elle ne recense que les relations pour
// lesquelles une écriture imbriquée existe réellement dans le code, ajoutées au fil de l'eau. Une
// relation absente d'ici n'ouvre donc rien — le verbe imbriqué est refusé tant qu'elle n'y est
// pas — d'où l'absence de test « toute relation du schéma doit y figurer » côté
// tenant-guard-schema.test.ts. Ce test y vérifie seulement l'autre sens : aucune entrée ne doit
// désigner une relation qui n'existe plus (ou plus sous ce nom) dans le schéma.
export const NESTED_RELATIONS: Record<string, Record<string, string>> = {
  Appointment: { appointmentPatients: 'AppointmentPatient' },
  Slot: { appointments: 'Appointment' },
  Pathway: { slots: 'Slot' },
  PathwayTemplate: { slotTemplates: 'SlotTemplate' },
  SlotTemplate: { soignantLinks: 'SlotTemplateSoignant', slot: 'Slot' },
  Thematic: { soignantLinks: 'SoignantThematic' },
  Soignant: { slotTemplateLinks: 'SlotTemplateSoignant', thematicLinks: 'SoignantThematic' },
  EstablishmentMembership: { serviceMemberships: 'ServiceMembership' },
  Patient: {
    appointmentPatients: 'AppointmentPatient',
    serviceFiles: 'PatientServiceFile',
  },
}

// Relations d'un modèle global qui exposent des données de tenant. Un include/select dessus ne
// peut être laissé passer que sur une opération ciblant une seule ligne (findUnique(OrThrow)) :
// c'est la seule façon de garantir que les enfants renvoyés appartiennent à un seul tenant.
//
// Ce contrôle ÉCHOUE OUVERT : une relation absente de cette table n'est simplement pas vue, donc
// l'include passe sans contrôle. La table porte donc une obligation d'exhaustivité, tenue par
// `tenant-guard-schema.test.ts`, qui relit prisma/schema.prisma — mais une obligation plus
// étroite que celle de TENANT_CHILD_RELATIONS plus bas, et il faut lire la différence : toute
// relation d'un modèle global MENANT A UN MODELE DE TENANT doit figurer ici, et toute entrée
// d'ici doit exister au schéma. Ce qui n'est PAS exigé, c'est de déclarer les relations qui ne
// mènent pas à du tenant : déclarer une relation ici la RESTREINT (plus d'include hors
// findUnique), et une exigence d'égalité stricte forcerait à restreindre, par exemple, un futur
// `User.notificationPreferences` sans aucun rapport avec le cloisonnement. Le test tient à la
// place la liste — vide à ce jour — de ces relations-là, pour qu'aucune n'entre au schéma sans
// qu'on ait tranché. (Avant ce test, la table avait déjà dérivé : elle désignait un
// `User.soignant` disparu depuis l'étape 1, où le lien vers `Soignant` est passé à
// `EstablishmentMembership`.)
//
// `User` et `Establishment` ne sont ni dans SERVICE_MODELS ni dans ESTABLISHMENT_MODELS : ce sont
// des modèles globaux, et toutes leurs relations mènent aujourd'hui à des données de tenant.
export const GLOBAL_TENANT_RELATIONS: Record<string, readonly string[]> = {
  User: ['establishmentMemberships'],
  Establishment: [
    'services',
    'memberships',
    'patients',
    'soignants',
    'locations',
  ],
}

// Relations d'un modèle d'ÉTABLISSEMENT (parent → champ → modèle cible). Noms repris un par un
// des modèles correspondants de prisma/schema.prisma : toute relation ajoutée là-bas doit l'être
// ici. La table est exhaustive et c'est une liste blanche : un `include` sur une relation absente
// d'ici est refusé (voir assertChildInclude) plutôt que laissé sans contrôle.
//
// Les entrées dont le modèle cible appartient à SERVICE_MODELS exigent en plus un filtre explicite
// sur le service courant : partir d'une ligne d'établissement et descendre dans un modèle de
// service ramène sinon les enfants de TOUS les services. C'est exactement la fuite trouvée à
// l'étape 1 (un patient remontait les problèmes d'inscription de tous les services), corrigée
// alors repository par repository.
//
// Exportée pour `tenant-guard-schema.test.ts`, qui relit prisma/schema.prisma et échoue si une
// relation y a été ajoutée, renommée ou supprimée sans être répercutée ici. C'est ce test qui
// garantit l'exhaustivité de la table, et donc que le contrôle du `select` ci-dessous — qui ne
// peut pas, lui, exiger la déclaration — ne laisse rien passer.
export const TENANT_CHILD_RELATIONS: Record<string, Record<string, string>> = {
  Patient: {
    establishment: 'Establishment',
    appointmentPatients: 'AppointmentPatient',
    pathwayPriorities: 'PatientPathwayPriority',
    serviceFiles: 'PatientServiceFile',
  },
  Soignant: {
    establishment: 'Establishment',
    slotTemplateLinks: 'SlotTemplateSoignant',
    thematicLinks: 'SoignantThematic',
    todos: 'Todo',
    memberships: 'EstablishmentMembership',
  },
  Location: {
    establishment: 'Establishment',
    slotTemplates: 'SlotTemplate',
  },
  Service: {
    establishment: 'Establishment',
    memberships: 'ServiceMembership',
    patientServiceFiles: 'PatientServiceFile',
  },
  EstablishmentMembership: {
    user: 'User',
    establishment: 'Establishment',
    soignant: 'Soignant',
    serviceMemberships: 'ServiceMembership',
  },
  ServiceMembership: {
    establishmentMembership: 'EstablishmentMembership',
    service: 'Service',
  },
  // `ActivityLog` ne déclare aucune relation dans le schéma : tout include y est donc refusé.
  ActivityLog: {},
}

const UNIQUE_READ_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow'])

const READ_OPERATIONS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'update', 'updateMany', 'updateManyAndReturn',
  'delete', 'deleteMany', 'upsert', 'count', 'aggregate', 'groupBy',
])
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert'])
// Sous-ensemble des opérations de lecture dont le `data` peut déplacer une ligne d'un tenant à
// l'autre (voir assertNoTenantMove). Le `update` d'un upsert est traité séparément : sa clé
// (args.update) ne coïncide pas avec args.data.
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn'])

// Verbes Prisma d'écriture imbriquée : la présence de l'un d'eux dans la valeur d'un champ
// signale une relation à vérifier plutôt qu'une simple colonne scalaire.
const WRITE_VERBS = [
  'create', 'createMany', 'connectOrCreate', 'connect', 'set',
  'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'disconnect',
]

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

// Lit `field` au premier niveau du where, ou dans une clé composite (convention Prisma : les
// clés uniques composées concatènent leurs champs avec `_`, ex. `id_serviceId`,
// `appointmentId_patientId`). On exige cette `_` avant de descendre dans une valeur objet :
// aucun nom de champ ou de relation de ce schéma n'en contient, ce qui exclut naturellement les
// opérateurs logiques (OR/AND/NOT) et les filtres de relation (`{ slot: { serviceId: … } }`),
// qui doivent continuer à être refusés faute de filtre direct sur la ligne elle-même.
const whereValue = (where: unknown, field: string): unknown => {
  if (!isDict(where)) {
    return undefined
  }
  if (field in where) {
    return where[field]
  }
  for (const [key, value] of Object.entries(where)) {
    if (key.includes('_') && isDict(value) && field in value) {
      return value[field]
    }
  }
  return undefined
}

const expectedValue = (store: TenantStore, field: string, model: string, operation: string): string => {
  if (store.kind !== 'tenant') {
    throw new TenantScopeMissingError(model, operation, field)
  }
  const value = field === 'serviceId' ? store.tenant.serviceId : store.tenant.establishmentId
  // Refuse toute valeur qui n'est pas une chaîne non vide : un champ absent plutôt qu'à `null`
  // ne doit jamais se comparer par accident à un `where` sans filtre (les deux valant
  // `undefined`).
  if (typeof value !== 'string' || value.length === 0) {
    throw new TenantScopeMissingError(model, operation, field)
  }
  return value
}

const assertWhereLike = (
  model: string,
  operation: string,
  where: unknown,
  field: string,
  store: TenantStore,
): void => {
  const expected = expectedValue(store, field, model, operation)
  if (whereValue(where, field) !== expected) {
    throw new TenantScopeMissingError(model, operation, field)
  }
}

const assertWhere = (model: string, operation: string, args: Dict, field: string, store: TenantStore): void =>
  assertWhereLike(model, operation, args.where, field, store)

// Empêche un update de déplacer une ligne d'un tenant à l'autre : si serviceId ou
// establishmentId figure dans les données, sa valeur doit être celle du tenant courant. Absent,
// c'est le cas normal (l'update ne touche pas à ces colonnes) et on laisse passer.
const assertNoTenantMove = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  if (!isDict(data)) {
    return
  }
  const family = familyOf(model)
  if (family === 'service' && 'serviceId' in data && data.serviceId !== expectedValue(store, 'serviceId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'serviceId')
  }
  if (family !== 'global' && 'establishmentId' in data && data.establishmentId !== expectedValue(store, 'establishmentId', model, operation)) {
    throw new TenantScopeMissingError(model, operation, 'establishmentId')
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

const isNestedWrite = (value: unknown): value is Dict =>
  isDict(value) && WRITE_VERBS.some((verb) => verb in value)

// Prisma accepte partout la valeur seule ou un tableau de valeurs.
const asEntries = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value]

// `connect` / `set` : chaque entrée doit porter, directement ou via une clé composite, la
// colonne de tenant de la famille de l'enfant — sinon on pourrait rattacher à la ligne courante
// un enregistrement d'un autre tenant qui existe déjà.
const assertConnectEntries = (
  model: string,
  operation: string,
  value: unknown,
  field: string,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    assertWhereLike(model, operation, entry, field, store)
  }
}

// `connectOrCreate` : la branche `create` est vérifiée comme un create (récursif, colonnes
// exigées), la branche `where` comme un connect (colonne de tenant exigée).
const assertConnectOrCreate = (
  model: string,
  operation: string,
  value: unknown,
  field: string,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    if (!isDict(entry)) {
      continue
    }
    if ('create' in entry) {
      assertData(model, `${operation}.create`, entry.create, store)
    }
    assertWhereLike(model, `${operation}.where`, entry.where, field, store)
  }
}

// Un `upsert` imbriqué crée ou met à jour un enfant : sa branche `create` est vérifiée comme
// un create (colonnes de tenant exigées, récursif), sa branche `update` comme une charge de
// mise à jour. La valeur peut être un objet ou un tableau.
const assertNestedUpsert = (
  childModel: string,
  operation: string,
  value: unknown,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    if (!isDict(entry)) {
      continue
    }
    if ('create' in entry) {
      assertData(childModel, `${operation}.create`, entry.create, store)
    }
    assertUpdatePayload(childModel, `${operation}.update`, entry.update, store)
  }
}

// Un `update` / `updateMany` imbriqué ne choisit pas librement sa ligne (la relation s'en
// charge), mais rien n'empêcherait son `data` de déplacer l'enfant vers un autre tenant, ni d'y
// imbriquer une écriture non vérifiée. Prisma accepte la forme `{ where, data }` comme la forme
// courte où l'entrée EST le `data`.
const assertNestedUpdate = (
  childModel: string,
  operation: string,
  value: unknown,
  store: TenantStore,
): void => {
  for (const entry of asEntries(value)) {
    const data = isDict(entry) && 'data' in entry ? entry.data : entry
    assertUpdatePayload(childModel, operation, data, store)
  }
}

// Vérifie une écriture imbriquée déclarée, verbe par verbe.
const assertNestedWrite = (childModel: string, operation: string, value: Dict, store: TenantStore): void => {
  const field = familyOf(childModel) === 'service' ? 'serviceId' : 'establishmentId'
  if ('create' in value) {
    assertData(childModel, `${operation}.create`, value.create, store)
  }
  if (isDict(value.createMany) && 'data' in value.createMany) {
    assertData(childModel, `${operation}.createMany`, value.createMany.data, store)
  }
  if ('connectOrCreate' in value) {
    assertConnectOrCreate(childModel, `${operation}.connectOrCreate`, value.connectOrCreate, field, store)
  }
  if ('connect' in value) {
    assertConnectEntries(childModel, `${operation}.connect`, value.connect, field, store)
  }
  if ('set' in value) {
    assertConnectEntries(childModel, `${operation}.set`, value.set, field, store)
  }
  // `upsert` imbriqué : `'create' in value` ci-dessus capte le verbe `create`, pas
  // `upsert.create` — sa branche de création doit donc être vérifiée à part.
  if ('upsert' in value) {
    assertNestedUpsert(childModel, `${operation}.upsert`, value.upsert, store)
  }
  // `update` / `updateMany` imbriqués : la relation garantit QUELLE ligne est touchée, pas ce
  // qu'on y écrit.
  if ('update' in value) {
    assertNestedUpdate(childModel, `${operation}.update`, value.update, store)
  }
  if ('updateMany' in value) {
    assertNestedUpdate(childModel, `${operation}.updateMany`, value.updateMany, store)
  }
  // delete / deleteMany / disconnect imbriqués : aucun contrôle supplémentaire. Ils n'écrivent
  // aucune colonne, et Prisma ne peut les résoudre que parmi les enfants déjà rattachés à la
  // ligne parente (par la relation, pas par un identifiant libre), dont le `where` est déjà
  // vérifié ailleurs — ces enfants sont donc déjà dans le bon tenant. Le même raisonnement vaut
  // pour le CHOIX de la ligne d'un update/upsert imbriqué ; c'est sa CHARGE écrite, vérifiée
  // ci-dessus, qui ne l'était pas.
}

// Toute écriture imbriquée doit porter sur une relation déclarée dans NESTED_RELATIONS : une
// relation absente de la liste est refusée plutôt que laissée sans contrôle.
const assertNestedRelations = (model: string, operation: string, row: Dict, store: TenantStore): void => {
  const relations = NESTED_RELATIONS[model] ?? {}
  for (const [relationField, value] of Object.entries(row)) {
    if (!isNestedWrite(value)) {
      continue
    }
    const childModel = relations[relationField]
    if (!childModel) {
      throw new TenantScopeMissingError(
        model,
        operation,
        `relation '${relationField}' non déclarée — l'ajouter à NESTED_RELATIONS['${model}']`,
      )
    }
    assertNestedWrite(childModel, `${operation}>${relationField}`, value, store)
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

// Entrées effectivement demandées par un include/select. `false` écarte explicitement la
// relation ; `undefined` la laisse absente — c'est l'idiome d'une inclusion conditionnelle
// (`{ enrollmentIssues: withIssues ? { where } : undefined }`), que Prisma traite exactement
// comme une clé non écrite. Ni l'une ni l'autre ne ramène de ligne, donc ni l'une ni l'autre
// n'a à être filtrée.
const includedRelationEntries = (value: unknown): [string, unknown][] =>
  isDict(value)
    ? Object.entries(value).filter(([, included]) => included !== false && included !== undefined)
    : []

const includedRelationKeys = (value: unknown): string[] =>
  includedRelationEntries(value).map(([key]) => key)

// Un include/select depuis un modèle global qui touche une relation de tenant n'est sûr que sur
// une opération à une seule ligne (findUnique/findUniqueOrThrow) : c'est la seule garantie que
// les données incluses appartiennent à un seul tenant.
const assertGlobalInclude = (model: string, operation: string, args: Dict): void => {
  const tenantRelations = GLOBAL_TENANT_RELATIONS[model]
  if (!tenantRelations) {
    return
  }
  const requested = [...includedRelationKeys(args.include), ...includedRelationKeys(args.select)]
  const touchesTenantData = requested.some((key) => tenantRelations.includes(key))
  if (touchesTenantData && !UNIQUE_READ_OPERATIONS.has(operation)) {
    throw new TenantScopeMissingError(
      model,
      operation,
      'include/select sur une relation de tenant hors findUnique(OrThrow)',
    )
  }
}

// Une relation d'un modèle d'établissement vers un modèle de service doit porter son propre
// `where` sur le service courant : la ligne parente est filtrée par établissement, rien ne
// restreint ses enfants au service du tenant.
const assertServiceRelationFilter = (
  model: string,
  operation: string,
  relationField: string,
  value: unknown,
  store: TenantStore,
): void => {
  const detail =
    `include/select '${relationField}' vers un modèle de service sans filtre` +
    ` — ajouter { where: { serviceId } } sur '${relationField}'`
  // Le tenant courant peut n'avoir aucun service (administration d'établissement) : il n'existe
  // alors aucun service par lequel filtrer, et l'inclusion est refusée.
  const expected = store.kind === 'tenant' ? store.tenant.serviceId : null
  if (typeof expected !== 'string' || expected.length === 0) {
    throw new TenantScopeMissingError(model, operation, detail)
  }
  if (!isDict(value) || whereValue(value.where, 'serviceId') !== expected) {
    throw new TenantScopeMissingError(model, operation, detail)
  }
}

// Contrôle les include/select d'un modèle d'établissement. Complément symétrique de
// assertGlobalInclude, qui ne couvrait que les lectures partant d'un modèle global : une lecture
// partant d'un modèle d'établissement et incluant un modèle de service échappait à tout contrôle.
//
// LIMITE CONNUE, VOLONTAIREMENT LAISSÉE OUVERTE — à lire avant d'écrire une lecture imbriquée.
// Ce contrôle n'inspecte que le PREMIER niveau des arguments, c'est-à-dire `args.include` et
// `args.select` du modèle sur lequel porte l'opération. Il ne descend pas dans les include
// imbriqués. La condition exacte qui rouvre le trou est donc celle-ci, et elle seule :
//
//   une lecture qui ATTEINT un modèle d'établissement par une relation incluse depuis un autre
//   modèle — au lieu de partir de lui — puis qui, DEPUIS ce modèle d'établissement, redescend
//   vers un modèle de service.
//
// Concrètement, les chaînes du dépôt qui atteignent déjà un modèle d'établissement en profondeur
// sont : slot > appointments > appointmentPatients > patient (slot.repository), pathway > slots >
// appointments > appointmentPatients > patient (pathway.repository), appointment >
// appointmentPatients > patient (appointment.repository), todo > soignant (todo.repository),
// thematic|slotTemplate|pathwayTemplate > soignantLinks > soignant et slotTemplate > location
// (slot-template.include). Aucune ne redescend aujourd'hui : toutes s'arrêtent sur le patient, le
// soignant ou le lieu, qui n'embarquent rien de plus. Le jour où l'une d'elles s'écrira
// `patient: { include: { pathwayPriorities: … } }` (ou `appointmentPatients`, `serviceFiles` —
// depuis la tâche 6, `diagnostics` et `enrollmentIssues` ne sont plus des relations de `Patient`,
// mais de `PatientServiceFile`, atteignables via `serviceFiles: { include: { diagnostics: … } }`),
// `soignant: { include: { todos: … } }` (ou `thematicLinks`, `slotTemplateLinks`) ou
// `location: { include: { slotTemplates: … } }`, l'inclusion de service ne sera PAS vue ici et
// devra porter son `where: { serviceId }` à la main — exactement la situation d'avant cette
// fonction.
//
// Fermer ce cas suppose de suivre la famille du modèle courant le long de la descente, donc une
// table parent → relation → cible pour TOUS les modèles et non pour les seuls modèles
// d'établissement. C'est un chantier en soi, repoussé à l'étape 3, qui produira précisément la
// forme patient → sous-dossier de service.
const assertChildInclude = (model: string, operation: string, args: Dict, store: TenantStore): void => {
  const relations = TENANT_CHILD_RELATIONS[model]
  if (!relations) {
    return
  }
  // `include` n'accepte que des relations : toute clé doit donc être déclarée. Une clé inconnue
  // est refusée plutôt que laissée sans contrôle — y compris `_count`, qui compte des enfants
  // sans les filtrer.
  for (const [relationField, value] of includedRelationEntries(args.include)) {
    const childModel = relations[relationField]
    if (!childModel) {
      throw new TenantScopeMissingError(
        model,
        operation,
        `relation '${relationField}' non déclarée — l'ajouter à TENANT_CHILD_RELATIONS['${model}']`,
      )
    }
    if (familyOf(childModel) === 'service') {
      assertServiceRelationFilter(model, operation, relationField, value, store)
    }
  }
  // `select` mêle colonnes scalaires et relations, et rien ne permet ici de les distinguer : on
  // n'y exige donc pas la déclaration, seules les relations déclarées y sont vérifiées. La
  // complétude de la table reste garantie par `include` ci-dessus.
  for (const [relationField, value] of includedRelationEntries(args.select)) {
    const childModel = relations[relationField]
    if (childModel && familyOf(childModel) === 'service') {
      assertServiceRelationFilter(model, operation, relationField, value, store)
    }
  }
}

// Descend dans les relations imbriquées d'un `data` de mise à jour (update / updateMany /
// updateManyAndReturn, ou la branche `update` d'un upsert), avec les mêmes règles que pour une
// création : relation non déclarée refusée, create/createMany/connectOrCreate/connect/set
// vérifiés. Ne vérifie PAS les colonnes de tenant de `data` lui-même — un `data` de mise à jour
// n'en porte normalement aucune, et le cas où il en porte une est déjà couvert par
// assertNoTenantMove.
const assertNestedRelationsInUpdate = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  if (isDict(data)) {
    assertNestedRelations(model, operation, data, store)
  }
}

// Charge d'une mise à jour, au premier niveau comme imbriquée : ses colonnes de tenant ne
// doivent pas déplacer la ligne, et ses relations imbriquées suivent les mêmes règles que sous
// un create. Déclarée après `assertNestedWrite`, qui l'appelle : les deux sont mutuellement
// récursives (assertNestedWrite → assertUpdatePayload → assertNestedRelations →
// assertNestedWrite), comme `assertData` l'est déjà. La récursion n'a lieu qu'à l'appel, jamais
// à l'initialisation du module.
function assertUpdatePayload(model: string, operation: string, data: unknown, store: TenantStore): void {
  assertNoTenantMove(model, operation, data, store)
  assertNestedRelationsInUpdate(model, operation, data, store)
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
    assertGlobalInclude(model, operation, args)
    return
  }
  if (!store) {
    throw new TenantScopeMissingError(model, operation, 'context')
  }
  if (store.kind === 'system') {
    return
  }
  const isRead = READ_OPERATIONS.has(operation)
  const isWrite = WRITE_OPERATIONS.has(operation)
  // Une opération qui n'appartient à aucun des deux ensembles connus est refusée : mieux vaut
  // bloquer une opération légitime que laisser filer une opération future non vérifiée.
  if (!isRead && !isWrite) {
    throw new TenantScopeMissingError(model, operation, 'operation')
  }
  // Vaut pour les lectures comme pour les écritures : un `create ... include` renvoie les mêmes
  // données qu'un `findMany ... include`, et expose donc la même chose.
  if (family === 'establishment') {
    assertChildInclude(model, operation, args, store)
  }
  const field = family === 'service' ? 'serviceId' : 'establishmentId'
  if (isRead) {
    assertWhere(model, operation, args, field, store)
    if (UPDATE_OPERATIONS.has(operation)) {
      assertUpdatePayload(model, operation, args.data, store)
    }
  }
  if (isWrite) {
    const data = operation === 'upsert' ? args.create : args.data
    assertData(model, operation, data, store)
  }
  if (operation === 'upsert') {
    assertUpdatePayload(model, `${operation}.update`, args.update, store)
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
