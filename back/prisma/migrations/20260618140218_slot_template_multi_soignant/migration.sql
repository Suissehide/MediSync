/*
  Warnings:

  - You are about to drop the column `soignantID` on the `SlotTemplate` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "SlotTemplate" DROP CONSTRAINT "SlotTemplate_soignantID_fkey";

-- AlterTable
ALTER TABLE "SlotTemplate" DROP COLUMN "soignantID";

-- CreateTable
CREATE TABLE "_SlotTemplateSoignants" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SlotTemplateSoignants_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_SlotTemplateSoignants_B_index" ON "_SlotTemplateSoignants"("B");

-- AddForeignKey
ALTER TABLE "_SlotTemplateSoignants" ADD CONSTRAINT "_SlotTemplateSoignants_A_fkey" FOREIGN KEY ("A") REFERENCES "SlotTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SlotTemplateSoignants" ADD CONSTRAINT "_SlotTemplateSoignants_B_fkey" FOREIGN KEY ("B") REFERENCES "Soignant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
