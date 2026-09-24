-- CreateTable
CREATE TABLE "PatientServiceFile" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "referringCaregiver" TEXT,
    "followUpToDo" TEXT,
    "notes" TEXT,
    "details" TEXT,
    "medicalDiagnosis" TEXT,
    "entryDate" DATE,
    "careMode" TEXT,
    "orientation" TEXT,
    "etpDecision" TEXT,
    "programType" TEXT,
    "nonInclusionDetails" TEXT,
    "customContentDetails" TEXT,
    "goal" TEXT,
    "exitDate" DATE,
    "stopReason" TEXT,
    "etpFinalOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientServiceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientServiceFile_serviceId_idx" ON "PatientServiceFile"("serviceId");

-- CreateIndex
CREATE INDEX "PatientServiceFile_patientId_idx" ON "PatientServiceFile"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientServiceFile_patientId_serviceId_key" ON "PatientServiceFile"("patientId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientServiceFile_id_serviceId_key" ON "PatientServiceFile"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "PatientServiceFile" ADD CONSTRAINT "PatientServiceFile_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientServiceFile" ADD CONSTRAINT "PatientServiceFile_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentIssue" ADD CONSTRAINT "EnrollmentIssue_patientId_serviceId_fkey" FOREIGN KEY ("patientId", "serviceId") REFERENCES "PatientServiceFile"("patientId", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_patientId_serviceId_fkey" FOREIGN KEY ("patientId", "serviceId") REFERENCES "PatientServiceFile"("patientId", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
