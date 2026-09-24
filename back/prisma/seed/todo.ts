import type { PrismaClient } from '../../src/generated/client'
import type { SeedTenant } from './tenant'

export type TodoData = {
  title: string
  description: string
  completed: boolean
}

// Le contenu est passé par l'appelant : Todo est un modèle de service, et le
// nommer différemment par service (un patient différent cité dans chaque
// tâche) rend une fuite entre services visible dans le libellé même.
export default async function seedTodos(
  prisma: PrismaClient,
  tenant: SeedTenant,
  todos: TodoData[],
) {
  console.log('→ Seeding todos...')

  await prisma.todo.createMany({
    data: todos.map((todo) => ({
      ...todo,
      createDate: new Date(),
      establishmentId: tenant.establishmentId,
      serviceId: tenant.serviceId,
    })),
  })
}
