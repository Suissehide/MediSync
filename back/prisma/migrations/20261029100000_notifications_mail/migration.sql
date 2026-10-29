-- CreateEnum
CREATE TYPE "NotificationMailState" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "mailState" "NotificationMailState" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Notification_mailState_createdAt_idx" ON "Notification"("mailState", "createdAt");

-- Les notifications deja existantes n'ont jamais ete envoyees par e-mail : aucun e-mail par defaut.
UPDATE "Notification" SET "mailState" = 'SKIPPED';
