/*
  Warnings:

  - You are about to drop the column `entityId` on the `ActivityLog` table. All the data in the column will be lost.
  - Added the required column `entityID` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ActivityLog" DROP COLUMN "entityId",
ADD COLUMN     "entityID" TEXT NOT NULL;
