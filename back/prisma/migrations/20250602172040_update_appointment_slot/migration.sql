/*
  Warnings:

  - You are about to drop the column `endTime` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `homeDistanceKm` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `Slot` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Slot` table. All the data in the column will be lost.
  - Added the required column `endDate` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endDate` to the `Slot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Slot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "homeDistanceKm",
ADD COLUMN     "distance" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Slot" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL;
