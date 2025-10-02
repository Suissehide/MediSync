/*
  Warnings:

  - Added the required column `createDate` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "createDate" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "distance" SET DATA TYPE TEXT;
