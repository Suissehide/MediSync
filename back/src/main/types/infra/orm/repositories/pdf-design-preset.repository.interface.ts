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
  // `true` archive, `false` restaure.
  archived?: boolean
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
}
