import type { PrismaClient } from '@prisma/client'

export default async function seedPathways(
  prisma: PrismaClient,
  soignantIDs: string[],
) {
  console.log('→ Seeding pathways and templates...')

  const template = await prisma.pathwayTemplate.create({
    data: {
      name: 'Parcours Diabète',
      color: '#FF8C00',
      slotTemplates: {
        create: [
          {
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T09:00:00Z'),
            offsetDays: 0,
            isIndividual: true,
            color: '#FF8C00',
            description: 'Consultation initiale',
            soignantID: soignantIDs[0],
          },
          {
            startTime: new Date('1970-01-01T14:30:00Z'),
            endTime: new Date('1970-01-01T16:00:00Z'),
            offsetDays: 3,
            isIndividual: false,
            color: '#FFA500',
            description: 'Atelier collectif nutrition',
            soignantID: soignantIDs[1],
          },
        ],
      },
    },
    include: { slotTemplates: true },
  })

  await prisma.pathway.create({
    data: {
      startDate: new Date(),
      templateID: template.id,
      slots: {
        create: template.slotTemplates.map((slotTemplate) => ({
          startDate: new Date(),
          endDate: new Date(Date.now() + 60 * 60 * 1000),
          slotTemplateID: slotTemplate.id,
        })),
      },
    },
  })
}
