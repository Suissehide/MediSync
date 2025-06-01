/*
  Warnings:

  - You are about to drop the column `endDate` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Appointment` table. All the data in the column will be lost.
  - Added the required column `endTime` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "endDate",
DROP COLUMN "startDate",
ADD COLUMN     "endTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "pathwayId" TEXT,
ADD COLUMN     "soignantId" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "title" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PathwayTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathwayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pathway" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Soignant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Soignant_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pathway" ADD CONSTRAINT "Pathway_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PathwayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_soignantId_fkey" FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "Pathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PathwayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
