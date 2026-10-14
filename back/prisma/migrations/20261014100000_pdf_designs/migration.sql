BEGIN;
-- CreateTable
CREATE TABLE "PdfDesignPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfDesignPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfDesign" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sourcePresetId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfDesign_serviceId_idx" ON "PdfDesign"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfDesign_id_serviceId_key" ON "PdfDesign"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "PdfDesign" ADD CONSTRAINT "PdfDesign_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
