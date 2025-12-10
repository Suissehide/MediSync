/*
  Warnings:

  - You are about to drop the column `accompanying` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `rejectionReason` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `transmissionNotes` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the `_AppointmentToPatient` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_AppointmentToPatient" DROP CONSTRAINT "_AppointmentToPatient_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AppointmentToPatient" DROP CONSTRAINT "_AppointmentToPatient_B_fkey";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "accompanying",
DROP COLUMN "rejectionReason",
DROP COLUMN "status",
DROP COLUMN "transmissionNotes";

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "appointmentId" TEXT;

-- DropTable
DROP TABLE "public"."_AppointmentToPatient";

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
