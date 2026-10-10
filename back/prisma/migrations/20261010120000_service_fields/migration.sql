-- AlterTable
ALTER TABLE "PatientServiceFile" ADD COLUMN     "clinicalData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "data" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ServiceFieldDefinition" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "clinical" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFieldChoice" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceFieldChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceFieldDefinition_serviceId_idx" ON "ServiceFieldDefinition"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldDefinition_serviceId_key_key" ON "ServiceFieldDefinition"("serviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldDefinition_id_serviceId_key" ON "ServiceFieldDefinition"("id", "serviceId");

-- CreateIndex
CREATE INDEX "ServiceFieldChoice_fieldId_idx" ON "ServiceFieldChoice"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldChoice_fieldId_key_key" ON "ServiceFieldChoice"("fieldId", "key");

-- AddForeignKey
ALTER TABLE "ServiceFieldDefinition" ADD CONSTRAINT "ServiceFieldDefinition_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFieldChoice" ADD CONSTRAINT "ServiceFieldChoice_fieldId_serviceId_fkey" FOREIGN KEY ("fieldId", "serviceId") REFERENCES "ServiceFieldDefinition"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
