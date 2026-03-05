/*
  Warnings:

  - You are about to drop the column `enrollmentIssues` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "enrollmentIssues";

-- CreateTable
CREATE TABLE "EnrollmentIssue" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pathwayTemplateID" TEXT NOT NULL,
    "pathwayName" TEXT,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentIssue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EnrollmentIssue" ADD CONSTRAINT "EnrollmentIssue_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
