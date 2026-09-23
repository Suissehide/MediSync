import type { PrismaClient } from '../../src/generated/client'
import type { SeedTenant } from './tenant'

export default async function seedTodos(
  prisma: PrismaClient,
  tenant: SeedTenant,
) {
  console.log('→ Seeding todos...')

  await prisma.todo.createMany({
    data: [
      {
        title: 'Vérifier le dossier médical de Claire',
        description: 'S’assurer que les derniers résultats sont à jour.',
        createDate: new Date(),
        completed: false,
        establishmentId: tenant.establishmentId,
        serviceId: tenant.serviceId,
      },
      {
        title: 'Préparer atelier nutrition',
        description:
          'Réviser la présentation PowerPoint et les supports imprimés.',
        createDate: new Date(),
        completed: true,
        establishmentId: tenant.establishmentId,
        serviceId: tenant.serviceId,
      },
    ],
  })
}
