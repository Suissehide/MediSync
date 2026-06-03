-- AlterTable
ALTER TABLE "User" ADD COLUMN     "soignantId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_soignantId_fkey" FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
