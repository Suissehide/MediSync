import type { PrismaClient } from '@prisma/client'

export default async function seedPatients(prisma: PrismaClient) {
  console.log('→ Seeding patients...')

  await prisma.patient.createMany({
    data: [
      {
        firstName: 'Claire',
        lastName: 'Martin',
        gender: 'female',
        birthDate: new Date('1980-05-10'),
        phone1: '0612345678',
        email: 'claire.martin@example.com',
        createDate: new Date(),
        medicalDiagnosis: 'Diabète de type 2',
      },
      {
        firstName: 'Julien',
        lastName: 'Durand',
        gender: 'male',
        birthDate: new Date('1975-12-20'),
        phone1: '0699887766',
        email: 'julien.durand@example.com',
        createDate: new Date(),
        medicalDiagnosis: 'Hypertension',
      },
    ],
  })
}
