import type {
  Location,
  PathwayTemplate,
  Slot,
  SlotTemplate,
  Soignant,
  Thematic,
} from '../../../../generated/client'

// Les soignants d'un modèle de créneau passent par la table de liaison
// SlotTemplateSoignant : ce module l'aplatit systématiquement pour que
// domaines, schémas de réponse et front n'aient jamais à savoir qu'elle
// existe. Partagé avec les repositories pathway et appointment, qui
// n'incluent parfois que les liens soignants — d'où le type
// partiel ci-dessous.
export const soignantLinksInclude = {
  soignantLinks: { include: { soignant: true } },
} as const

// `template` (PathwayTemplate.id), `location` (Location.id) et `thematic`
// (Thematic.id) sont chacune référencées par une clé étrangère scalaire
// simple (`templateID`, `locationID`, `thematicId`) : ni le schéma ni le
// garde-fou de tenant ne portent la colonne de service sur cette clé, donc
// rien n'empêche techniquement qu'elle pointe vers une ligne d'un autre
// service. Elles restent sûres ici parce que la relation est à un seul
// enregistrement (jamais une liste) : Prisma ne peut ramener que la ligne
// précise désignée par l'id déjà stocké sur le SlotTemplate, lui-même
// toujours lu via une requête déjà filtrée par service. Cette sûreté ne
// vient donc pas de l'`include`, mais de la garantie que ces trois id ne
// sont jamais écrits sans vérifier au préalable qu'ils désignent une ligne
// du service courant — c'est le travail de la validation des
// références à l'écriture. Si cet invariant venait à changer (écriture
// directe de ces colonnes sans passer par une validation), ces trois
// relations cesseraient d'être sûres et il faudrait leur ajouter un filtre
// explicite, comme `soignantLinks`/`soignant` ci-dessus le font via leurs
// clés composites.
export const slotTemplateInclude = {
  ...soignantLinksInclude,
  template: true,
  location: true,
  thematic: true,
} as const

// Les champs autres que `soignantLinks` sont optionnels : un `include`
// partiel (ex. seulement `soignantLinksInclude`) doit satisfaire ce type
// sans contorsion, pour que flattenSlotTemplate reste utilisable par les
// repositories pathway et appointment.
type SlotTemplateRow = SlotTemplate & {
  soignantLinks: { soignant: Soignant }[]
  template?: PathwayTemplate | null
  location?: Location | null
  thematic?: Thematic | null
}

export const flattenSlotTemplate = <T extends SlotTemplateRow>({
  soignantLinks,
  ...rest
}: T) => ({
  ...rest,
  soignants: soignantLinks.map((link) => link.soignant),
})

type SlotRow = Slot & { slotTemplate: SlotTemplateRow }

export const flattenSlot = <T extends SlotRow>({
  slotTemplate,
  ...rest
}: T) => ({
  ...rest,
  slotTemplate: flattenSlotTemplate(slotTemplate),
})
