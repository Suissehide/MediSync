import type { PrismaClient } from '../../src/generated/client'
import { ARS_PRESET } from '../../src/main/utils/indicators/ars-preset'
import type { SeedTenant } from './tenant'

// Jeu « Grille ARS » d'un service ETP, comme le pose la migration indicator_sets.
export async function seedArsIndicatorSet(
  prisma: PrismaClient,
  tenant: SeedTenant,
) {
  const set = await prisma.indicatorSet.create({
    data: { ...tenant, name: 'Grille ARS', order: 0 },
  })
  const ids = new Map<string, string>()
  for (const [order, i] of ARS_PRESET.entries()) {
    const created = await prisma.indicator.create({
      data: {
        ...tenant,
        setId: set.id,
        order,
        code: i.code,
        label: i.label,
        group: i.group,
        nature: i.nature,
        measure: i.measure,
        options: i.options,
        filters: i.filters,
        breakdownField: i.breakdownField,
        input: i.input,
        note: i.note,
      },
    })
    ids.set(i.code, created.id)
  }
  for (const { code, parentCode } of ARS_PRESET) {
    if (parentCode) {
      await prisma.indicator.update({
        where: { id: ids.get(code) },
        data: { parentId: ids.get(parentCode) },
      })
    }
  }
  await prisma.service.update({
    where: { id: tenant.serviceId },
    data: {
      stopReasonFieldKey: 'stopReason',
      completedChoiceKey: 'PLUS_BESOIN_FIN_PARCOURS',
    },
  })
  return set
}
