-- CreateTable
CREATE TABLE "AppointmentPatient" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "accompanying" TEXT,
    "status" TEXT,
    "rejectionReason" TEXT,
    "transmissionNotes" TEXT,

    CONSTRAINT "AppointmentPatient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentPatient_appointmentId_patientId_key" ON "AppointmentPatient"("appointmentId", "patientId");

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
