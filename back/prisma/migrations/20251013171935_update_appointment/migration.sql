-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "accompanying" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "thematic" TEXT,
ADD COLUMN     "transmissionNotes" TEXT,
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "_AppointmentToPatient" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AppointmentToPatient_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AppointmentToPatient_B_index" ON "_AppointmentToPatient"("B");

-- AddForeignKey
ALTER TABLE "_AppointmentToPatient" ADD CONSTRAINT "_AppointmentToPatient_A_fkey" FOREIGN KEY ("A") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentToPatient" ADD CONSTRAINT "_AppointmentToPatient_B_fkey" FOREIGN KEY ("B") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
