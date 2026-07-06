-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('ambulatory', 'hospital', 'telephonic');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('yes', 'no');

-- AlterTable: convert free-text `type` to the AppointmentType enum.
-- Unknown/empty legacy values are mapped to NULL to avoid data loss.
ALTER TABLE "Appointment"
  ALTER COLUMN "type" TYPE "AppointmentType"
  USING (
    CASE
      WHEN "type" IN ('ambulatory', 'hospital', 'telephonic')
        THEN "type"::"AppointmentType"
      ELSE NULL
    END
  );

-- AlterTable: convert free-text `status` to the AppointmentStatus enum.
-- Empty string / unknown legacy values become NULL (not-set).
ALTER TABLE "AppointmentPatient"
  ALTER COLUMN "status" TYPE "AppointmentStatus"
  USING (
    CASE
      WHEN "status" IN ('yes', 'no')
        THEN "status"::"AppointmentStatus"
      ELSE NULL
    END
  );
