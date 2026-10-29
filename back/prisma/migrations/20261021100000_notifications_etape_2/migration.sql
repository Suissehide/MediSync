-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'PATIENT_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'APPOINTMENT_MOVED';
ALTER TYPE "NotificationType" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'ABSENT';
ALTER TYPE "NotificationType" ADD VALUE 'DIAGNOSTIC_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'PATHWAY_END';
ALTER TYPE "NotificationType" ADD VALUE 'SLOT_ALMOST_FULL';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
