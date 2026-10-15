BEGIN;
-- CreateTable
CREATE TABLE "PdfAsset" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfAsset_serviceId_idx" ON "PdfAsset"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfAsset_id_serviceId_key" ON "PdfAsset"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "PdfAsset" ADD CONSTRAINT "PdfAsset_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
