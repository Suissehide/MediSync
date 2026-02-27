export type FieldType = 'string' | 'boolean' | 'number' | 'date'

export type DiagnosticField = {
  id: string
  label: string
  type: FieldType
}

export type DiagnosticSection = {
  id: string
  label: string
  fields: DiagnosticField[]
}

export const DIAGNOSTIC_SECTIONS: DiagnosticSection[] = [
  {
    id: 'section_exemple',
    label: 'Section exemple',
    fields: [
      { id: 'section_exemple.champ_texte', label: 'Champ texte', type: 'string' },
      { id: 'section_exemple.champ_bool', label: 'Champ booléen', type: 'boolean' },
    ],
  },
  // ⚠️ Compléter avec les vraies sections/champs
]

export const ALL_FIELD_IDS = DIAGNOSTIC_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.id)
)
