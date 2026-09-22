-- Migration multi_tenant_socle
--
-- Trois temps, dans cet ordre :
--   1. Ajouter les nouvelles structures (enums, tables) et les colonnes de
--      tenant sur les tables existantes, SANS les contraindre (nullable),
--      pour pouvoir s'appliquer sur une base déjà peuplée.
--   2. Remplir ces colonnes pour les données existantes : un établissement et
--      un service uniques accueillent tout ce qui existait avant le
--      multi-tenant. Neutre (ne rien faire) sur une base vide.
--   3. Contraindre (NOT NULL, unicités, clés étrangères composites) et
--      nettoyer les anciennes structures (table de liaison implicites,
--      colonnes et enum de rôle globaux).

-- ============================================================
-- Temps 1 : ajouter sans contraindre
-- ============================================================

-- CreateEnum
CREATE TYPE "EstablishmentRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ServiceRole" AS ENUM ('COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE');

-- CreateTable (nouvelles tables : vides à la création, NOT NULL direct)
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstablishmentMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "role" "EstablishmentRole" NOT NULL DEFAULT 'MEMBER',
    "soignantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMembership" (
    "id" TEXT NOT NULL,
    "establishmentMembershipId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "role" "ServiceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotTemplateSoignant" (
    "slotTemplateId" TEXT NOT NULL,
    "soignantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,

    CONSTRAINT "SlotTemplateSoignant_pkey" PRIMARY KEY ("slotTemplateId","soignantId")
);

-- CreateTable
CREATE TABLE "SoignantThematic" (
    "soignantId" TEXT NOT NULL,
    "thematicId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,

    CONSTRAINT "SoignantThematic_pkey" PRIMARY KEY ("soignantId","thematicId")
);

-- AlterTable : colonnes de tenant ajoutées nullable pour l'instant (contraintes
-- NOT NULL posées au temps 3, une fois les données existantes remplies).
ALTER TABLE "ActivityLog" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "AppointmentPatient" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "DiagnosticEducatif" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "DiagnosticEducatifTemplate" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "EnrollmentIssue" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "ForbiddenWeek" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "establishmentId" TEXT;

-- AlterTable
ALTER TABLE "Pathway" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "PathwayTemplate" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "establishmentId" TEXT;

-- AlterTable
ALTER TABLE "PatientPathwayPriority" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
-- Le id DROP DEFAULT (le SQL n'a plus de défaut, il est désormais côté client
-- via @default(cuid())) est reporté au temps 3 : il ne dépend d'aucune donnée
-- et fait partie du nettoyage.
ALTER TABLE "PlanningCycle" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "SlotTemplate" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Soignant" ADD COLUMN     "establishmentId" TEXT;

-- AlterTable
ALTER TABLE "Thematic" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "establishmentId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable : colonnes indépendantes du tenant, sans risque sur une base
-- peuplée (NOT NULL avec DEFAULT : Postgres backfille directement).
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Temps 2 : remplir
-- ============================================================

-- Remplissage : un établissement et un service uniques pour les données existantes.
DO $$
DECLARE
  est_id TEXT;
  svc_id TEXT;
BEGIN
  -- Garde de neutralité : ne rien faire si aucune des tables ci-dessous n'a de ligne.
  -- Cette liste doit porter EXACTEMENT les mêmes tables, dans le même ordre, que les
  -- ALTER COLUMN ... SET NOT NULL du temps 3 ci-dessous (ActivityLog exclue : ses
  -- colonnes de tenant restent nullables, elle n'a donc besoin d'aucune garde ici).
  -- Toute table ajoutée à l'une des deux listes doit être ajoutée à l'autre.
  IF NOT EXISTS (SELECT 1 FROM "Appointment")
     AND NOT EXISTS (SELECT 1 FROM "AppointmentPatient")
     AND NOT EXISTS (SELECT 1 FROM "DiagnosticEducatif")
     AND NOT EXISTS (SELECT 1 FROM "DiagnosticEducatifTemplate")
     AND NOT EXISTS (SELECT 1 FROM "EnrollmentIssue")
     AND NOT EXISTS (SELECT 1 FROM "ForbiddenWeek")
     AND NOT EXISTS (SELECT 1 FROM "Location")
     AND NOT EXISTS (SELECT 1 FROM "Pathway")
     AND NOT EXISTS (SELECT 1 FROM "PathwayTemplate")
     AND NOT EXISTS (SELECT 1 FROM "Patient")
     AND NOT EXISTS (SELECT 1 FROM "PatientPathwayPriority")
     AND NOT EXISTS (SELECT 1 FROM "PlanningCycle")
     AND NOT EXISTS (SELECT 1 FROM "Slot")
     AND NOT EXISTS (SELECT 1 FROM "SlotTemplate")
     AND NOT EXISTS (SELECT 1 FROM "Soignant")
     AND NOT EXISTS (SELECT 1 FROM "Thematic")
     AND NOT EXISTS (SELECT 1 FROM "Todo") THEN
    RETURN;
  END IF;

  est_id := 'est_' || substr(md5(random()::text), 1, 20);
  svc_id := 'svc_' || substr(md5(random()::text), 1, 20);

  INSERT INTO "Establishment" ("id", "name", "createdAt") VALUES (est_id, 'Établissement', now());
  INSERT INTO "Service" ("id", "establishmentId", "name", "createdAt") VALUES (svc_id, est_id, 'Service', now());

  UPDATE "Patient"  SET "establishmentId" = est_id;
  UPDATE "Soignant" SET "establishmentId" = est_id;
  UPDATE "Location" SET "establishmentId" = est_id;
  UPDATE "ActivityLog" SET "establishmentId" = est_id, "serviceId" = svc_id;

  UPDATE "PathwayTemplate"            SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Pathway"                    SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "SlotTemplate"               SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Slot"                       SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Appointment"                SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "AppointmentPatient"         SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Thematic"                   SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "DiagnosticEducatifTemplate" SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "DiagnosticEducatif"         SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "EnrollmentIssue"            SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "PatientPathwayPriority"     SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "ForbiddenWeek"              SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "PlanningCycle"              SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Todo"                       SET "establishmentId" = est_id, "serviceId" = svc_id;

  -- Utilisateurs : ADMIN -> ADMIN + COORDINATEUR, USER -> MEMBER + INTERVENANT, NONE -> rien.
  INSERT INTO "EstablishmentMembership" ("id", "userId", "establishmentId", "role", "soignantId", "createdAt")
  SELECT 'em_' || substr(md5(u."id"), 1, 20), u."id", est_id,
         CASE WHEN u."role" = 'ADMIN' THEN 'ADMIN'::"EstablishmentRole" ELSE 'MEMBER'::"EstablishmentRole" END,
         u."soignantId", now()
  FROM "User" u WHERE u."role" IN ('ADMIN', 'USER');

  INSERT INTO "ServiceMembership" ("id", "establishmentMembershipId", "serviceId", "establishmentId", "role", "createdAt")
  SELECT 'sm_' || substr(md5(u."id"), 1, 20), em."id", svc_id, est_id,
         CASE WHEN u."role" = 'ADMIN' THEN 'COORDINATEUR'::"ServiceRole" ELSE 'INTERVENANT'::"ServiceRole" END,
         now()
  FROM "User" u JOIN "EstablishmentMembership" em ON em."userId" = u."id"
  WHERE u."role" IN ('ADMIN', 'USER');

  -- Relations plusieurs-à-plusieurs : tables implicites -> tables explicites.
  -- Colonnes A/B des tables implicites Prisma : A référence le modèle premier
  -- par ordre alphabétique, B le second. Vérifié dans les migrations
  -- existantes du dépôt :
  --   - 20260618140218_slot_template_multi_soignant/migration.sql :
  --     "_SlotTemplateSoignants_A_fkey" référence "SlotTemplate", "_B_fkey" référence "Soignant"
  --     (donc A = SlotTemplate, B = Soignant : pas d'inversion).
  --   - migration.sql qui crée "_SoignantThematics" :
  --     "_SoignantThematics_A_fkey" référence "Soignant", "_B_fkey" référence "Thematic"
  --     (donc A = Soignant, B = Thematic : pas d'inversion).
  INSERT INTO "SlotTemplateSoignant" ("slotTemplateId", "soignantId", "serviceId", "establishmentId")
  SELECT l."A", l."B", svc_id, est_id FROM "_SlotTemplateSoignants" l;

  INSERT INTO "SoignantThematic" ("soignantId", "thematicId", "serviceId", "establishmentId")
  SELECT l."A", l."B", svc_id, est_id FROM "_SoignantThematics" l;
END $$;

-- ============================================================
-- Temps 3 : contraindre et nettoyer
-- ============================================================

-- Colonnes de tenant obligatoires (hors ActivityLog, qui reste nullable :
-- certaines lignes peuvent ne pas être rattachées à un tenant).
ALTER TABLE "Appointment" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "AppointmentPatient" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "AppointmentPatient" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "DiagnosticEducatif" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "DiagnosticEducatif" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "DiagnosticEducatifTemplate" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "DiagnosticEducatifTemplate" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "EnrollmentIssue" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "EnrollmentIssue" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "ForbiddenWeek" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "ForbiddenWeek" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Pathway" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Pathway" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "PathwayTemplate" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "PathwayTemplate" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Patient" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "PatientPathwayPriority" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "PatientPathwayPriority" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "PlanningCycle" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "PlanningCycle" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Slot" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Slot" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "SlotTemplate" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "SlotTemplate" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Soignant" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Thematic" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Thematic" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Todo" ALTER COLUMN "establishmentId" SET NOT NULL;
ALTER TABLE "Todo" ALTER COLUMN "serviceId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Service_establishmentId_name_key" ON "Service"("establishmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_establishmentId_key" ON "Service"("id", "establishmentId");

-- CreateIndex
CREATE INDEX "EstablishmentMembership_establishmentId_idx" ON "EstablishmentMembership"("establishmentId");

-- CreateIndex
CREATE INDEX "EstablishmentMembership_soignantId_idx" ON "EstablishmentMembership"("soignantId");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentMembership_userId_establishmentId_key" ON "EstablishmentMembership"("userId", "establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentMembership_id_establishmentId_key" ON "EstablishmentMembership"("id", "establishmentId");

-- CreateIndex
CREATE INDEX "ServiceMembership_serviceId_idx" ON "ServiceMembership"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMembership_establishmentMembershipId_serviceId_key" ON "ServiceMembership"("establishmentMembershipId", "serviceId");

-- CreateIndex
CREATE INDEX "SlotTemplateSoignant_soignantId_idx" ON "SlotTemplateSoignant"("soignantId");

-- CreateIndex
CREATE INDEX "SlotTemplateSoignant_serviceId_idx" ON "SlotTemplateSoignant"("serviceId");

-- CreateIndex
CREATE INDEX "SoignantThematic_thematicId_idx" ON "SoignantThematic"("thematicId");

-- CreateIndex
CREATE INDEX "SoignantThematic_serviceId_idx" ON "SoignantThematic"("serviceId");

-- CreateIndex
CREATE INDEX "ActivityLog_establishmentId_idx" ON "ActivityLog"("establishmentId");

-- CreateIndex
CREATE INDEX "ActivityLog_serviceId_idx" ON "ActivityLog"("serviceId");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_serviceId_key" ON "Appointment"("id", "serviceId");

-- CreateIndex
CREATE INDEX "AppointmentPatient_serviceId_idx" ON "AppointmentPatient"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentPatient_id_serviceId_key" ON "AppointmentPatient"("id", "serviceId");

-- CreateIndex
CREATE INDEX "DiagnosticEducatif_serviceId_idx" ON "DiagnosticEducatif"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticEducatif_id_serviceId_key" ON "DiagnosticEducatif"("id", "serviceId");

-- CreateIndex
CREATE INDEX "DiagnosticEducatifTemplate_serviceId_idx" ON "DiagnosticEducatifTemplate"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticEducatifTemplate_id_serviceId_key" ON "DiagnosticEducatifTemplate"("id", "serviceId");

-- CreateIndex
CREATE INDEX "EnrollmentIssue_serviceId_idx" ON "EnrollmentIssue"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentIssue_id_serviceId_key" ON "EnrollmentIssue"("id", "serviceId");

-- CreateIndex
CREATE INDEX "ForbiddenWeek_serviceId_idx" ON "ForbiddenWeek"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ForbiddenWeek_id_serviceId_key" ON "ForbiddenWeek"("id", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ForbiddenWeek_serviceId_startOfWeek_key" ON "ForbiddenWeek"("serviceId", "startOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Location_establishmentId_name_key" ON "Location"("establishmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_id_establishmentId_key" ON "Location"("id", "establishmentId");

-- CreateIndex
CREATE INDEX "Pathway_serviceId_idx" ON "Pathway"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Pathway_id_serviceId_key" ON "Pathway"("id", "serviceId");

-- CreateIndex
CREATE INDEX "PathwayTemplate_serviceId_idx" ON "PathwayTemplate"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayTemplate_id_serviceId_key" ON "PathwayTemplate"("id", "serviceId");

-- CreateIndex
CREATE INDEX "Patient_establishmentId_idx" ON "Patient"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_id_establishmentId_key" ON "Patient"("id", "establishmentId");

-- CreateIndex
CREATE INDEX "PatientPathwayPriority_serviceId_idx" ON "PatientPathwayPriority"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningCycle_serviceId_key" ON "PlanningCycle"("serviceId");

-- CreateIndex
CREATE INDEX "Slot_serviceId_idx" ON "Slot"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_id_serviceId_key" ON "Slot"("id", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_slotTemplateID_serviceId_key" ON "Slot"("slotTemplateID", "serviceId");

-- CreateIndex
CREATE INDEX "SlotTemplate_serviceId_idx" ON "SlotTemplate"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotTemplate_id_serviceId_key" ON "SlotTemplate"("id", "serviceId");

-- CreateIndex
CREATE INDEX "Soignant_establishmentId_idx" ON "Soignant"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Soignant_id_establishmentId_key" ON "Soignant"("id", "establishmentId");

-- CreateIndex
CREATE INDEX "Thematic_serviceId_idx" ON "Thematic"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Thematic_serviceId_name_key" ON "Thematic"("serviceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Thematic_id_serviceId_key" ON "Thematic"("id", "serviceId");

-- CreateIndex
CREATE INDEX "Todo_serviceId_idx" ON "Todo"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Todo_id_serviceId_key" ON "Todo"("id", "serviceId");

-- DropForeignKey (anciens FK simples, remplacés par les composites ci-dessous)
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_slotID_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentPatient" DROP CONSTRAINT "AppointmentPatient_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentPatient" DROP CONSTRAINT "AppointmentPatient_patientId_fkey";

-- DropForeignKey
ALTER TABLE "DiagnosticEducatif" DROP CONSTRAINT "DiagnosticEducatif_patientId_fkey";

-- DropForeignKey
ALTER TABLE "EnrollmentIssue" DROP CONSTRAINT "EnrollmentIssue_patientId_fkey";

-- DropForeignKey
ALTER TABLE "PatientPathwayPriority" DROP CONSTRAINT "PatientPathwayPriority_pathwayID_fkey";

-- DropForeignKey
ALTER TABLE "PatientPathwayPriority" DROP CONSTRAINT "PatientPathwayPriority_patientID_fkey";

-- DropForeignKey
ALTER TABLE "Slot" DROP CONSTRAINT "Slot_slotTemplateID_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_soignantId_fkey";

-- DropForeignKey
ALTER TABLE "_SlotTemplateSoignants" DROP CONSTRAINT "_SlotTemplateSoignants_A_fkey";

-- DropForeignKey
ALTER TABLE "_SlotTemplateSoignants" DROP CONSTRAINT "_SlotTemplateSoignants_B_fkey";

-- DropForeignKey
ALTER TABLE "_SoignantThematics" DROP CONSTRAINT "_SoignantThematics_A_fkey";

-- DropForeignKey
ALTER TABLE "_SoignantThematics" DROP CONSTRAINT "_SoignantThematics_B_fkey";

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentMembership" ADD CONSTRAINT "EstablishmentMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentMembership" ADD CONSTRAINT "EstablishmentMembership_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentMembership" ADD CONSTRAINT "EstablishmentMembership_soignantId_fkey" FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMembership" ADD CONSTRAINT "ServiceMembership_establishmentMembershipId_fkey" FOREIGN KEY ("establishmentMembershipId") REFERENCES "EstablishmentMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMembership" ADD CONSTRAINT "ServiceMembership_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplateSoignant" ADD CONSTRAINT "SlotTemplateSoignant_slotTemplateId_serviceId_fkey" FOREIGN KEY ("slotTemplateId", "serviceId") REFERENCES "SlotTemplate"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplateSoignant" ADD CONSTRAINT "SlotTemplateSoignant_soignantId_establishmentId_fkey" FOREIGN KEY ("soignantId", "establishmentId") REFERENCES "Soignant"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoignantThematic" ADD CONSTRAINT "SoignantThematic_soignantId_establishmentId_fkey" FOREIGN KEY ("soignantId", "establishmentId") REFERENCES "Soignant"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoignantThematic" ADD CONSTRAINT "SoignantThematic_thematicId_serviceId_fkey" FOREIGN KEY ("thematicId", "serviceId") REFERENCES "Thematic"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPathwayPriority" ADD CONSTRAINT "PatientPathwayPriority_patientID_establishmentId_fkey" FOREIGN KEY ("patientID", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPathwayPriority" ADD CONSTRAINT "PatientPathwayPriority_pathwayID_serviceId_fkey" FOREIGN KEY ("pathwayID", "serviceId") REFERENCES "Pathway"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotID_serviceId_fkey" FOREIGN KEY ("slotID", "serviceId") REFERENCES "Slot"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_appointmentId_serviceId_fkey" FOREIGN KEY ("appointmentId", "serviceId") REFERENCES "Appointment"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentPatient" ADD CONSTRAINT "AppointmentPatient_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_slotTemplateID_serviceId_fkey" FOREIGN KEY ("slotTemplateID", "serviceId") REFERENCES "SlotTemplate"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soignant" ADD CONSTRAINT "Soignant_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentIssue" ADD CONSTRAINT "EnrollmentIssue_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex (anciennes unicités remplacées par les nouvelles composites, et
-- index simple sur la colonne soignantId de User qui disparaît juste après)
DROP INDEX "ForbiddenWeek_startOfWeek_key";

-- DropIndex
DROP INDEX "Location_name_key";

-- DropIndex
DROP INDEX "Thematic_name_key";

-- DropIndex
DROP INDEX "User_soignantId_idx";

-- Nettoyage final : tables de liaison implicites devenues inutiles, colonnes
-- et enum globaux de rôle remplacés par les habilitations d'établissement et
-- de service, défaut SQL de PlanningCycle.id (désormais géré côté client).
DROP TABLE "_SlotTemplateSoignants";
DROP TABLE "_SoignantThematics";
ALTER TABLE "User" DROP COLUMN "role", DROP COLUMN "soignantId";
DROP TYPE "Role";
ALTER TABLE "PlanningCycle" ALTER COLUMN "id" DROP DEFAULT;
