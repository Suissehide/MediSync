/*
  Warnings:

  - You are about to drop the column `duration` on the `SlotTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SlotTemplate" DROP COLUMN "duration";

-- AlterTable
ALTER TABLE "Thematic" ADD COLUMN     "duration" INTEGER;
