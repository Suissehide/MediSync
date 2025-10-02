/*
  Warnings:

  - Added the required column `color` to the `SlotTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SlotTemplate" ADD COLUMN     "color" TEXT NOT NULL;
