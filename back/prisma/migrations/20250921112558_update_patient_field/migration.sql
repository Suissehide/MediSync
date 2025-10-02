/*
  Warnings:

  - You are about to drop the column `mhd` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `offers` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `theraflow` on the `Patient` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "mhd",
DROP COLUMN "offers",
DROP COLUMN "theraflow";
