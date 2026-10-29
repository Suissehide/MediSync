import type { PdfDesignPreset } from '../../../../../generated/client'

export type PdfDesignPresetEntityRepo = PdfDesignPreset

export type PdfDesignPresetCreateEntityRepo = {
  name: string
  content: unknown
  sortOrder: number
}

export type PdfDesignPresetUpdateEntityRepo = {
  name?: string
  content?: unknown
  sortOrder?: number
  // `true` archive, `false` restaure.
  archived?: boolean
  // `true` termine le brouillon (les services peuvent alors le dupliquer), `false` l'y remet.
  published?: boolean
}

export interface PdfDesignPresetRepositoryInterface {
  findAll: (archived?: boolean) => Promise<PdfDesignPresetEntityRepo[]>
  findByID: (presetID: string) => Promise<PdfDesignPresetEntityRepo | null>
  create: (
    params: PdfDesignPresetCreateEntityRepo,
  ) => Promise<PdfDesignPresetEntityRepo>
  update: (
    presetID: string,
    params: PdfDesignPresetUpdateEntityRepo,
  ) => Promise<PdfDesignPresetEntityRepo>
  // Ecrit `sortOrder: index` pour chacun, dans l'ordre recu. Le domaine a deja verifie que la
  // liste decrit exactement l'ensemble existant.
  reorder: (ids: string[]) => Promise<void>
}
