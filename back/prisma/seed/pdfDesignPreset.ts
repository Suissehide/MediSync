import type { PrismaClient } from '../../src/generated/client'
import {
  REFERENCE_PRESET_CONTENT,
  REFERENCE_PRESET_ID,
  REFERENCE_PRESET_NAME,
} from '../../src/main/utils/pdf-design/reference-preset'

// Presets GLOBAUX : aucun tenant, d'ou l'absence de SeedTenant en argument.
//
// L'`update: {}` est delibere, et c'est le meme idiome que seed/location.ts : un rejeu du seed ne
// doit PAS reecrire le `content` d'un preset que le super-admin a retouche. Un `upsert` qui
// renseignerait `update` effacerait ce travail sans bruit, a chaque deploiement.
export default async function seedPdfDesignPresets(prisma: PrismaClient) {
  console.log('→ Seeding PDF design presets...')

  await prisma.pdfDesignPreset.upsert({
    where: { id: REFERENCE_PRESET_ID },
    update: {},
    create: {
      id: REFERENCE_PRESET_ID,
      name: REFERENCE_PRESET_NAME,
      content: REFERENCE_PRESET_CONTENT,
      // TERMINE des sa creation : c'est le modele que tout service doit pouvoir dupliquer.
      // Un modele livre naît brouillon quand un humain le cree, pas quand le seed le pose.
      publishedAt: new Date(),
      sortOrder: 0,
    },
  })

  console.log('✓ PDF design presets ready')
}
