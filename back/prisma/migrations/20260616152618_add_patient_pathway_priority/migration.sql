-- CreateTable
CREATE TABLE "PatientPathwayPriority" (
    "patientID" TEXT NOT NULL,
    "pathwayID" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "PatientPathwayPriority_pkey" PRIMARY KEY ("patientID","pathwayID")
);

-- CreateIndex
CREATE INDEX "PatientPathwayPriority_patientID_priority_idx" ON "PatientPathwayPriority"("patientID", "priority");

-- AddForeignKey
ALTER TABLE "PatientPathwayPriority" ADD CONSTRAINT "PatientPathwayPriority_patientID_fkey" FOREIGN KEY ("patientID") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPathwayPriority" ADD CONSTRAINT "PatientPathwayPriority_pathwayID_fkey" FOREIGN KEY ("pathwayID") REFERENCES "Pathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
