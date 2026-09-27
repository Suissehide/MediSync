-- CreateTable
CREATE TABLE "PatientAccessLog" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "userFirstName" TEXT,
    "userLastName" TEXT,
    "action" TEXT NOT NULL,
    "exportCount" INTEGER,
    "exportFilters" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientAccessLog_patientId_idx" ON "PatientAccessLog"("patientId");

-- CreateIndex
CREATE INDEX "PatientAccessLog_createdAt_idx" ON "PatientAccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "PatientAccessLog_establishmentId_serviceId_idx" ON "PatientAccessLog"("establishmentId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccessLog_id_serviceId_key" ON "PatientAccessLog"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "PatientAccessLog" ADD CONSTRAINT "PatientAccessLog_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccessLog" ADD CONSTRAINT "PatientAccessLog_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
