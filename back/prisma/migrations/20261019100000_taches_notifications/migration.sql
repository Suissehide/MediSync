/*
  Warnings:

  - You are about to drop the `Todo` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "patientId" TEXT,
    "dueDate" DATE,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_serviceId_idx" ON "Task"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_serviceId_key" ON "Task"("id", "serviceId");

-- CreateIndex
CREATE INDEX "TaskAssignee_serviceId_idx" ON "TaskAssignee"("serviceId");

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE INDEX "Notification_serviceId_idx" ON "Notification"("serviceId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_id_serviceId_key" ON "Notification"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_serviceId_fkey" FOREIGN KEY ("taskId", "serviceId") REFERENCES "Task"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chaque Todo devient une tâche : tagués = membres hors LECTURE qui incarnent le soignant, auteur = le premier.
INSERT INTO "Task" ("id", "establishmentId", "serviceId", "text", "authorId", "createdAt", "doneAt")
SELECT t."id", t."establishmentId", t."serviceId",
  CASE WHEN t."description" IS NULL OR t."description" = '' THEN t."title" ELSE t."title" || E'\n' || t."description" END,
  (SELECT em."userId" FROM "ServiceMembership" sm
     JOIN "EstablishmentMembership" em ON em."id" = sm."establishmentMembershipId"
    WHERE sm."serviceId" = t."serviceId" AND sm."soignantId" = t."soignantID" AND sm."role" <> 'LECTURE'
    ORDER BY em."userId" LIMIT 1),
  t."createDate",
  CASE WHEN t."completed" THEN t."createDate" END
FROM "Todo" t;

INSERT INTO "TaskAssignee" ("establishmentId", "serviceId", "taskId", "userId")
SELECT DISTINCT t."establishmentId", t."serviceId", t."id", em."userId"
FROM "Todo" t
JOIN "ServiceMembership" sm ON sm."serviceId" = t."serviceId" AND sm."soignantId" = t."soignantID" AND sm."role" <> 'LECTURE'
JOIN "EstablishmentMembership" em ON em."id" = sm."establishmentMembershipId";

-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_soignantID_fkey";

-- DropTable
DROP TABLE "Todo";
