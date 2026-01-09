-- DropForeignKey
ALTER TABLE "public"."AppointmentPatient" DROP CONSTRAINT "AppointmentPatient_appointmentId_fkey";

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
