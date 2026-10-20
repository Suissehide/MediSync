import type {
  PdfDesign,
  PdfDesignPreset,
} from '../../../../../generated/client'

export type PdfDesignEntityRepo = PdfDesign
export type PdfDesignPresetEntityRepo = PdfDesignPreset

export type PdfDesignCreateEntityRepo = {
  name: string
  content: unknown
  sourcePresetId: string | null
}

export type PdfDesignUpdateEntityRepo = {
  name?: string
  content?: unknown
  isDefault?: boolean
  // `true` supprime (archive), `false` restaure.
  archived?: boolean
  // `true` termine le brouillon (il devient proposable a l'export), `false` l'y remet.
  published?: boolean
}

export interface PdfDesignRepositoryInterface {
  findAllForService: (archived?: boolean) => Promise<PdfDesignEntityRepo[]>
  // Un design du service courant, pour le dupliquer. `null` s'il est supprime ou d'ailleurs.
  findByID: (designID: string) => Promise<PdfDesignEntityRepo | null>
  // Modele global : les presets sont les memes pour tous les services.
  findAllPresets: () => Promise<PdfDesignPresetEntityRepo[]>
  findPresetByID: (
    presetID: string,
  ) => Promise<PdfDesignPresetEntityRepo | null>
  // Les noms deja pris dans ce service, ARCHIVES COMPRIS : la numerotation d'une copie ne doit
  // pas se remettre a 2 parce qu'une copie a ete supprimee, sinon la restaurer ferait deux
  // lignes du meme nom.
  namesInService: () => Promise<string[]>
  create: (params: PdfDesignCreateEntityRepo) => Promise<PdfDesignEntityRepo>
  update: (
    designID: string,
    params: PdfDesignUpdateEntityRepo,
  ) => Promise<PdfDesignEntityRepo>
}
