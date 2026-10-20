import type { PrismaClient } from '../../src/generated/client'
import type { SeedTenant } from './tenant'

export type TaskData = { text: string; done: boolean }

// Auteur : le 2e compte ; tagué : le compte de dev, pour qu'il ait une mention non lue au premier lancement.
export default async function seedTasks(
  prisma: PrismaClient,
  tenant: SeedTenant,
  tasks: TaskData[],
  authorId: string,
  devUserId: string,
) {
  console.log('→ Seeding tasks...')
  for (const t of tasks) {
    const task = await prisma.task.create({
      data: {
        ...tenant,
        text: t.text,
        authorId,
        doneAt: t.done ? new Date() : null,
        // serviceId omis : Prisma le dérive de la relation composite vers Task.
        assignees: {
          create: [
            { establishmentId: tenant.establishmentId, userId: devUserId },
          ],
        },
      },
    })
    // Pas d'auto-mention : pour Pneumologie, le compte de dev est aussi l'auteur.
    if (!t.done && authorId !== devUserId) {
      await prisma.notification.create({
        data: {
          ...tenant,
          userId: devUserId,
          type: 'MENTION',
          payload: { taskId: task.id, authorId, text: t.text },
        },
      })
    }
  }
}
