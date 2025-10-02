/*
  Warnings:

  - You are about to drop the column `identifier` on the `SlotTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SlotTemplate" DROP COLUMN "identifier",
ADD COLUMN     "capacity" INTEGER;
