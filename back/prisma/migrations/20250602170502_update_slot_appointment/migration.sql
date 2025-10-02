/*
  Warnings:

  - You are about to drop the column `title` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Slot` table. All the data in the column will be lost.
  - Added the required column `description` to the `Slot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `identifier` to the `Slot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `location` to the `Slot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thematic` to the `Slot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "title";

-- AlterTable
ALTER TABLE "Slot" DROP COLUMN "title",
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "identifier" TEXT NOT NULL,
ADD COLUMN     "location" TEXT NOT NULL,
ADD COLUMN     "thematic" TEXT NOT NULL;
