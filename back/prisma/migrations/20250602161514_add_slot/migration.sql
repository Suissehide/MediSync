/*
  Warnings:

  - You are about to drop the column `pathwayId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `soignantId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `Appointment` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_pathwayId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_soignantId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_templateId_fkey";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "pathwayId",
DROP COLUMN "soignantId",
DROP COLUMN "templateId";

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "soignantId" TEXT,
    "templateId" TEXT,
    "pathwayId" TEXT,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_soignantId_fkey" FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "Pathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PathwayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
