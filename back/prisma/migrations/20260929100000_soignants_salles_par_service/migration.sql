-- Soignants et salles propres a chaque service (2026-09-29).
--
-- Un soignant est un METIER qui intervient dans un service (« Infirmiere d'education »,
-- « Dieteticienne »), pas une personne unique de l'etablissement ; une salle, un lieu du service.
-- Les deux deviennent des modeles de service. Decision de Leo, 2026-09-29 : chaque
-- soignant et chaque salle d'avant est COPIE dans CHAQUE service de son etablissement (actifs et
-- desactives, pour que les creneaux d'un service desactive gardent leurs references) ; les
-- coordinateurs font le tri ensuite. Voir docs/multi-tenant/decisions-navigation.md.
--
-- La premiere copie (premier service par date de creation, puis identifiant) GARDE l'identifiant
-- d'origine : les references de ce service-la restent justes sans rien toucher. Les autres copies
-- recoivent un identifiant neuf, et chaque reference (creneau, thematique, tache, affectation)
-- est reorientee vers la copie de SON service.
--
-- Le rattachement d'un membre a un soignant (`EstablishmentMembership.soignantId`) passe sur
-- chacune de ses affectations de service (`ServiceMembership.soignantId`), vers la copie du
-- soignant dans ce service-la.
--
-- La garde ci-dessous passe avant toute ecriture : un refus n'a rien touche.

-- Garde : un etablissement qui a des soignants ou des salles mais AUCUN service n'a nulle part ou
-- les ranger. Plutot que de les supprimer sans le dire, la migration refuse ; creer un service
-- (ou supprimer ces soignants/salles) avant de la relancer.
DO $$
DECLARE
  sans_service TEXT;
BEGIN
  SELECT string_agg(DISTINCT e.id, ', ')
    INTO sans_service
    FROM "Establishment" e
   WHERE (EXISTS (SELECT 1 FROM "Soignant" s WHERE s."establishmentId" = e.id)
          OR EXISTS (SELECT 1 FROM "Location" l WHERE l."establishmentId" = e.id))
     AND NOT EXISTS (SELECT 1 FROM "Service" v WHERE v."establishmentId" = e.id);
  IF sans_service IS NOT NULL THEN
    RAISE EXCEPTION 'Migration refusee : ces etablissements ont des soignants ou des salles mais aucun service (%). '
      'Creer un service dans chacun (ou supprimer ces soignants et salles), puis relancer.', sans_service;
  END IF;
END $$;

-- Anciennes contraintes, retirees avant la copie : l'unicite (establishmentId, name) des salles
-- refuserait les copies, et les cles etrangeres composites (soignantId, establishmentId) ne
-- conviennent plus.
ALTER TABLE "EstablishmentMembership" DROP CONSTRAINT "EstablishmentMembership_soignantId_fkey";
ALTER TABLE "SlotTemplateSoignant" DROP CONSTRAINT "SlotTemplateSoignant_soignantId_establishmentId_fkey";
ALTER TABLE "SoignantThematic" DROP CONSTRAINT "SoignantThematic_soignantId_establishmentId_fkey";
ALTER TABLE "Soignant" DROP CONSTRAINT "Soignant_establishmentId_fkey";
ALTER TABLE "Location" DROP CONSTRAINT "Location_establishmentId_fkey";
DROP INDEX "EstablishmentMembership_soignantId_idx";
DROP INDEX "Soignant_establishmentId_idx";
DROP INDEX "Soignant_id_establishmentId_key";
DROP INDEX "Location_establishmentId_name_key";
DROP INDEX "Location_id_establishmentId_key";

ALTER TABLE "Soignant" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "Location" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "ServiceMembership" ADD COLUMN "soignantId" TEXT;

-- References incoherentes d'avant (une tache ou un creneau pointant un soignant ou une salle d'un
-- AUTRE etablissement — possibles, ces deux liens etant des references simples verifiees par le
-- domaine) : aucune copie ne leur correspondrait. Elles sont effacees plutot que laissees vers une
-- ligne d'un autre tenant.
UPDATE "Todo" t SET "soignantID" = NULL
  FROM "Soignant" s
 WHERE s.id = t."soignantID" AND s."establishmentId" <> t."establishmentId";
UPDATE "SlotTemplate" st SET "locationID" = NULL
  FROM "Location" l
 WHERE l.id = st."locationID" AND l."establishmentId" <> st."establishmentId";

-- Table de correspondance : une ligne par (soignant, service de son etablissement).
-- `'c' || uuid sans tirets` : meme fabrique d'identifiants que la migration patient_service_file
-- (le front et le back valident les identifiants avec `z.cuid()`, qui exige une lettre en tete).
CREATE TEMPORARY TABLE soignant_copie AS
SELECT s.id AS ancien_id,
       v.id AS service_id,
       s."establishmentId" AS establishment_id,
       row_number() OVER (PARTITION BY s.id ORDER BY v."createdAt", v.id) AS rang
  FROM "Soignant" s
  JOIN "Service" v ON v."establishmentId" = s."establishmentId";
ALTER TABLE soignant_copie ADD COLUMN nouvel_id TEXT;
UPDATE soignant_copie
   SET nouvel_id = CASE WHEN rang = 1 THEN ancien_id ELSE 'c' || replace(gen_random_uuid()::text, '-', '') END;

CREATE TEMPORARY TABLE salle_copie AS
SELECT l.id AS ancien_id,
       v.id AS service_id,
       l."establishmentId" AS establishment_id,
       row_number() OVER (PARTITION BY l.id ORDER BY v."createdAt", v.id) AS rang
  FROM "Location" l
  JOIN "Service" v ON v."establishmentId" = l."establishmentId";
ALTER TABLE salle_copie ADD COLUMN nouvel_id TEXT;
UPDATE salle_copie
   SET nouvel_id = CASE WHEN rang = 1 THEN ancien_id ELSE 'c' || replace(gen_random_uuid()::text, '-', '') END;

-- Les lignes d'origine rejoignent leur premier service ; les copies sont inserees.
UPDATE "Soignant" s SET "serviceId" = c.service_id
  FROM soignant_copie c WHERE c.ancien_id = s.id AND c.rang = 1;
INSERT INTO "Soignant" (id, "establishmentId", "serviceId", name)
SELECT c.nouvel_id, c.establishment_id, c.service_id, s.name
  FROM soignant_copie c JOIN "Soignant" s ON s.id = c.ancien_id
 WHERE c.rang > 1;

UPDATE "Location" l SET "serviceId" = c.service_id
  FROM salle_copie c WHERE c.ancien_id = l.id AND c.rang = 1;
INSERT INTO "Location" (id, "establishmentId", "serviceId", name)
SELECT c.nouvel_id, c.establishment_id, c.service_id, l.name
  FROM salle_copie c JOIN "Location" l ON l.id = c.ancien_id
 WHERE c.rang > 1;

-- Chaque reference de service vise desormais la copie de SON service.
UPDATE "SlotTemplateSoignant" x SET "soignantId" = c.nouvel_id
  FROM soignant_copie c
 WHERE c.ancien_id = x."soignantId" AND c.service_id = x."serviceId" AND c.rang > 1;
UPDATE "SoignantThematic" x SET "soignantId" = c.nouvel_id
  FROM soignant_copie c
 WHERE c.ancien_id = x."soignantId" AND c.service_id = x."serviceId" AND c.rang > 1;
UPDATE "Todo" x SET "soignantID" = c.nouvel_id
  FROM soignant_copie c
 WHERE c.ancien_id = x."soignantID" AND c.service_id = x."serviceId" AND c.rang > 1;
UPDATE "SlotTemplate" x SET "locationID" = c.nouvel_id
  FROM salle_copie c
 WHERE c.ancien_id = x."locationID" AND c.service_id = x."serviceId" AND c.rang > 1;

-- Le rattachement membre → soignant, sur chaque affectation de service.
UPDATE "ServiceMembership" sm SET "soignantId" = c.nouvel_id
  FROM "EstablishmentMembership" em, soignant_copie c
 WHERE em.id = sm."establishmentMembershipId"
   AND c.ancien_id = em."soignantId"
   AND c.service_id = sm."serviceId";

DROP TABLE soignant_copie;
DROP TABLE salle_copie;

ALTER TABLE "EstablishmentMembership" DROP COLUMN "soignantId";
ALTER TABLE "Soignant" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "serviceId" SET NOT NULL;

CREATE INDEX "ServiceMembership_soignantId_idx" ON "ServiceMembership"("soignantId");
CREATE INDEX "Soignant_serviceId_idx" ON "Soignant"("serviceId");
CREATE UNIQUE INDEX "Soignant_id_serviceId_key" ON "Soignant"("id", "serviceId");
CREATE INDEX "Location_serviceId_idx" ON "Location"("serviceId");
CREATE UNIQUE INDEX "Location_serviceId_name_key" ON "Location"("serviceId", "name");
CREATE UNIQUE INDEX "Location_id_serviceId_key" ON "Location"("id", "serviceId");

ALTER TABLE "ServiceMembership" ADD CONSTRAINT "ServiceMembership_soignantId_fkey" FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SlotTemplateSoignant" ADD CONSTRAINT "SlotTemplateSoignant_soignantId_serviceId_fkey" FOREIGN KEY ("soignantId", "serviceId") REFERENCES "Soignant"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoignantThematic" ADD CONSTRAINT "SoignantThematic_soignantId_serviceId_fkey" FOREIGN KEY ("soignantId", "serviceId") REFERENCES "Soignant"("id", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;
