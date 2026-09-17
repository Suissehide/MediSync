-- Sépare les tags d'un modèle de parcours en un tag principal (obligatoire)
-- et des tags secondaires. Le premier tag existant devient le tag principal,
-- les suivants deviennent secondaires. Sans tag, le nom du parcours sert de
-- tag principal.
ALTER TABLE "PathwayTemplate" ADD COLUMN "mainTag" TEXT;
ALTER TABLE "PathwayTemplate" ADD COLUMN "secondaryTags" TEXT[];

UPDATE "PathwayTemplate"
SET "mainTag" = COALESCE(NULLIF(BTRIM("tags"[1]), ''), "name"),
    "secondaryTags" = COALESCE("tags"[2:array_length("tags", 1)], '{}');

ALTER TABLE "PathwayTemplate" ALTER COLUMN "mainTag" SET NOT NULL;
ALTER TABLE "PathwayTemplate" ALTER COLUMN "secondaryTags" SET NOT NULL;
ALTER TABLE "PathwayTemplate" DROP COLUMN "tags";
