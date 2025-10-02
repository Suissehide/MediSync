/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Pathway` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Pathway` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `Pathway` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `PathwayTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `identifier` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `pathwayId` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `soignantId` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `thematic` on the `Slot` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slotTemplateID]` on the table `Slot` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slotID` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `color` to the `PathwayTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotTemplateID` to the `Slot` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Pathway" DROP CONSTRAINT "Pathway_templateId_fkey";

-- DropForeignKey
ALTER TABLE "Slot" DROP CONSTRAINT "Slot_pathwayId_fkey";

-- DropForeignKey
ALTER TABLE "Slot" DROP CONSTRAINT "Slot_soignantId_fkey";

-- DropForeignKey
ALTER TABLE "Slot" DROP CONSTRAINT "Slot_templateId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "slotID" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Pathway" DROP COLUMN "createdAt",
DROP COLUMN "name",
DROP COLUMN "templateId",
ADD COLUMN     "templateID" TEXT;

-- AlterTable
ALTER TABLE "PathwayTemplate" DROP COLUMN "createdAt",
ADD COLUMN     "color" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "Slot" DROP COLUMN "description",
DROP COLUMN "identifier",
DROP COLUMN "location",
DROP COLUMN "pathwayId",
DROP COLUMN "soignantId",
DROP COLUMN "templateId",
DROP COLUMN "thematic",
ADD COLUMN     "pathwayID" TEXT,
ADD COLUMN     "slotTemplateID" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "SlotTemplate" (
    "id" TEXT NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "thematic" TEXT,
    "identifier" TEXT,
    "location" TEXT,
    "description" TEXT,
    "soignantID" TEXT,
    "templateID" TEXT,

    CONSTRAINT "SlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Slot_slotTemplateID_key" ON "Slot"("slotTemplateID");

-- AddForeignKey
ALTER TABLE "Pathway" ADD CONSTRAINT "Pathway_templateID_fkey" FOREIGN KEY ("templateID") REFERENCES "PathwayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotID_fkey" FOREIGN KEY ("slotID") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_soignantID_fkey" FOREIGN KEY ("soignantID") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_templateID_fkey" FOREIGN KEY ("templateID") REFERENCES "PathwayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_pathwayID_fkey" FOREIGN KEY ("pathwayID") REFERENCES "Pathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_slotTemplateID_fkey" FOREIGN KEY ("slotTemplateID") REFERENCES "SlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
