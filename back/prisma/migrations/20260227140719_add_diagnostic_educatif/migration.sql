-- AlterTable
ALTER TABLE "PathwayTemplate" ALTER COLUMN "tags" DROP DEFAULT;

-- CreateTable
CREATE TABLE "DiagnosticEducatifTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeFields" TEXT[],

    CONSTRAINT "DiagnosticEducatifTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticEducatif" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "activeFields" TEXT[],
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "DiagnosticEducatif_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DiagnosticEducatifTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
