import type { PdfDesign, PdfDesignPreset } from '../../../../../generated/client'

export type PdfDesignEntityRepo = PdfDesign
export type PdfDesignPresetEntityRepo = PdfDesignPreset

export interface PdfDesignRepositoryInterface {
  findAllForService: () => Promise<PdfDesignEntityRepo[]>
  // Modele global : les presets sont les memes pour tous les services.
  findAllPresets: () => Promise<PdfDesignPresetEntityRepo[]>
}
