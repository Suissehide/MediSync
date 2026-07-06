-- Add nullable FK columns
ALTER TABLE "Appointment" ADD COLUMN "thematicId" TEXT;
ALTER TABLE "SlotTemplate" ADD COLUMN "thematicId" TEXT;

-- Create Thematic rows for any free-text thematic name not yet in the table,
-- so the backfill loses no data (orphan names become real thematics).
INSERT INTO "Thematic" ("id", "name")
SELECT gen_random_uuid()::text, names.name
FROM (
  SELECT DISTINCT "thematic" AS name FROM "Appointment"
  WHERE "thematic" IS NOT NULL AND "thematic" <> ''
  UNION
  SELECT DISTINCT "thematic" AS name FROM "SlotTemplate"
  WHERE "thematic" IS NOT NULL AND "thematic" <> ''
) names
WHERE NOT EXISTS (SELECT 1 FROM "Thematic" t WHERE t."name" = names.name);

-- Backfill the FK from the (now guaranteed to match) free-text name
UPDATE "Appointment" a SET "thematicId" = t."id"
FROM "Thematic" t WHERE t."name" = a."thematic";
UPDATE "SlotTemplate" s SET "thematicId" = t."id"
FROM "Thematic" t WHERE t."name" = s."thematic";

-- Drop the old free-text columns
ALTER TABLE "Appointment" DROP COLUMN "thematic";
ALTER TABLE "SlotTemplate" DROP COLUMN "thematic";

-- CreateIndex
CREATE INDEX "Appointment_thematicId_idx" ON "Appointment"("thematicId");
CREATE INDEX "SlotTemplate_thematicId_idx" ON "SlotTemplate"("thematicId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_thematicId_fkey"
  FOREIGN KEY ("thematicId") REFERENCES "Thematic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_thematicId_fkey"
  FOREIGN KEY ("thematicId") REFERENCES "Thematic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
