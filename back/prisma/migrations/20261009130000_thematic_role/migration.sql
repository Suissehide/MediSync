-- Rôle d'une thématique dans les indicateurs, réglé par le chef de service.
CREATE TYPE "ThematicRole" AS ENUM ('DIAGNOSTIC_EDUCATIF', 'REACTUALISATION', 'BILAN_DE_FIN');
ALTER TABLE "Thematic" ADD COLUMN "role" "ThematicRole";

-- Préremplissage depuis le nom, sans casse ni accents, préfixe toléré ; rejoué par deploy/scripts/import-draxa.py.
-- preremplissage-debut
UPDATE "Thematic" t SET "role" = r.role FROM (
  SELECT id, (CASE
    WHEN k LIKE '%diagnostic educatif%' THEN 'DIAGNOSTIC_EDUCATIF'
    WHEN k ~ '(^|[^a-z])reactu' THEN 'REACTUALISATION'
    WHEN k LIKE '%bilan de sortie%' OR k LIKE '%bilan de fin%' THEN 'BILAN_DE_FIN'
  END)::"ThematicRole" AS role
  FROM (SELECT id, lower(translate(name, 'ÉÈÊËéèêëÀÂàâÎÏîïÔôÙÛÜùûüÇç', 'EEEEeeeeAAaaIIiiOoUUUuuuCc')) AS k FROM "Thematic") n
) r
WHERE t.id = r.id AND t."role" IS NULL AND r.role IS NOT NULL
-- preremplissage-fin
;
