-- DropForeignKey
ALTER TABLE "public"."AppointmentPatient" DROP CONSTRAINT "AppointmentPatient_patientId_fkey";

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
