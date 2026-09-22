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
// existe. Partagé avec les repositories pathway et appointment (tâches 12,
// 13), qui n'incluent parfois que les liens soignants — d'où le type
// partiel ci-dessous.
export const soignantLinksInclude = {
  soignantLinks: { include: { soignant: true } },
} as const

export const slotTemplateInclude = {
  ...soignantLinksInclude,
  template: true,
  location: true,
  thematic: true,
} as const

// Les champs autres que `soignantLinks` sont optionnels : un `include`
// partiel (ex. seulement `soignantLinksInclude`) doit satisfaire ce type
// sans contorsion, pour que flattenSlotTemplate reste utilisable par les
// tâches 12 et 13.
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

export const flattenSlot = <T extends SlotRow>({ slotTemplate, ...rest }: T) => ({
  ...rest,
  slotTemplate: flattenSlotTemplate(slotTemplate),
})
