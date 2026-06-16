/*
  Warnings:

  - You are about to drop the column `location` on the `SlotTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SlotTemplate" DROP COLUMN "location",
ADD COLUMN     "locationID" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- AddForeignKey
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_locationID_fkey" FOREIGN KEY ("locationID") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
