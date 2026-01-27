-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "soignantID" TEXT;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_soignantID_fkey" FOREIGN KEY ("soignantID") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
