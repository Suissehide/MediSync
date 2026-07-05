-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_slotID_fkey";

-- CreateIndex
CREATE INDEX "Appointment_slotID_idx" ON "Appointment"("slotID");

-- CreateIndex
CREATE INDEX "AppointmentPatient_patientId_idx" ON "AppointmentPatient"("patientId");

-- CreateIndex
CREATE INDEX "DiagnosticEducatif_patientId_idx" ON "DiagnosticEducatif"("patientId");

-- CreateIndex
CREATE INDEX "DiagnosticEducatif_templateId_idx" ON "DiagnosticEducatif"("templateId");

-- CreateIndex
CREATE INDEX "EnrollmentIssue_patientId_idx" ON "EnrollmentIssue"("patientId");

-- CreateIndex
CREATE INDEX "Pathway_startDate_idx" ON "Pathway"("startDate");

-- CreateIndex
CREATE INDEX "Pathway_templateID_idx" ON "Pathway"("templateID");

-- CreateIndex
CREATE INDEX "Slot_startDate_idx" ON "Slot"("startDate");

-- CreateIndex
CREATE INDEX "Slot_pathwayID_idx" ON "Slot"("pathwayID");

-- CreateIndex
CREATE INDEX "SlotTemplate_templateID_idx" ON "SlotTemplate"("templateID");

-- CreateIndex
CREATE INDEX "SlotTemplate_locationID_idx" ON "SlotTemplate"("locationID");

-- CreateIndex
CREATE INDEX "Todo_soignantID_idx" ON "Todo"("soignantID");

-- CreateIndex
CREATE INDEX "User_soignantId_idx" ON "User"("soignantId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotID_fkey" FOREIGN KEY ("slotID") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
