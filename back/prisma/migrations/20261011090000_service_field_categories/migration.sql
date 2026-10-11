BEGIN;
-- CreateTable
CREATE TABLE "ServiceFieldCategory" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "dateField" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceFieldCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceFieldCategory_serviceId_idx" ON "ServiceFieldCategory"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldCategory_id_serviceId_key" ON "ServiceFieldCategory"("id", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldCategory_serviceId_dateField_key" ON "ServiceFieldCategory"("serviceId", "dateField");

-- AddForeignKey
ALTER TABLE "ServiceFieldCategory" ADD CONSTRAINT "ServiceFieldCategory_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les deux catégories à date de chaque service (DEFAULT_CATEGORIES).
INSERT INTO "ServiceFieldCategory" (id, "establishmentId", "serviceId", label, "order", "dateField")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), s."establishmentId", s.id, d.label, d.ord, d.date_field
FROM "Service" s CROSS JOIN (VALUES
  ('Parcours & Inclusion', 0, 'entryDate'),
  ('Sortie & Bilan', 1, 'exitDate')
) AS d(label, ord, date_field);

ALTER TABLE "ServiceFieldDefinition" ADD COLUMN "categoryId" TEXT;

UPDATE "ServiceFieldDefinition" f SET "categoryId" = c.id
FROM "ServiceFieldCategory" c
WHERE c."serviceId" = f."serviceId"
  AND c."dateField" = CASE f.section WHEN 'pathway' THEN 'entryDate' WHEN 'outcome' THEN 'exitDate' END;

-- Garde : par service, autant de champs par ancienne section que dans la catégorie correspondante, aucun sans catégorie.
DO $$
DECLARE fautif text;
BEGIN
  SELECT string_agg(s.name || ' (' || s.id || ')', ', ' ORDER BY s.id) INTO fautif
  FROM "Service" s
  WHERE EXISTS (SELECT 1 FROM "ServiceFieldDefinition" f WHERE f."serviceId" = s.id AND f."categoryId" IS NULL)
     OR (SELECT count(*) FROM "ServiceFieldDefinition" f WHERE f."serviceId" = s.id AND f.section = 'pathway')
        <> (SELECT count(*) FROM "ServiceFieldDefinition" f JOIN "ServiceFieldCategory" c ON c.id = f."categoryId"
            WHERE f."serviceId" = s.id AND c."serviceId" = s.id AND c."dateField" = 'entryDate')
     OR (SELECT count(*) FROM "ServiceFieldDefinition" f WHERE f."serviceId" = s.id AND f.section = 'outcome')
        <> (SELECT count(*) FROM "ServiceFieldDefinition" f JOIN "ServiceFieldCategory" c ON c.id = f."categoryId"
            WHERE f."serviceId" = s.id AND c."serviceId" = s.id AND c."dateField" = 'exitDate');
  IF fautif IS NOT NULL THEN
    RAISE EXCEPTION 'Migration service_field_categories refusee : champs mal rattaches pour %', fautif;
  END IF;
END $$;

ALTER TABLE "ServiceFieldDefinition" ALTER COLUMN "categoryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ServiceFieldDefinition" ADD CONSTRAINT "ServiceFieldDefinition_categoryId_serviceId_fkey" FOREIGN KEY ("categoryId", "serviceId") REFERENCES "ServiceFieldCategory"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceFieldDefinition" DROP COLUMN "section";
COMMIT;
