-- Reconstruit une thematique supprimee par erreur et les liens que
-- `onDelete: SetNull` / `Cascade` ont effaces (rendez-vous, modeles de creneau,
-- soignants).
--
-- A jouer sur une base restauree dans l'etat D'AVANT la suppression ; la sortie
-- est le SQL de reparation a rejouer sur la base de PROD.
--
--   deploy/scripts/restore-db-dump.sh <dump-de-la-veille>
--   docker exec -i medisync-postgres psql -U postgres -d medisync -At \
--     -v name='Mes facteurs de risque' -f - \
--     < deploy/scripts/recover-thematic.sql > /tmp/reparation.sql
--
-- Si la thematique a deja ete recreee a la main en prod, la supprimer avant de
-- rejouer la reparation : l'INSERT reprend l'identifiant d'origine et buterait
-- sur l'unicite (serviceId, name).

\set ON_ERROR_STOP on

SELECT 'BEGIN;';

SELECT format(
  'INSERT INTO "Thematic" (id, "establishmentId", "serviceId", name, duration, "pdfNotice") VALUES (%L, %L, %L, %L, %s, %L);',
  id, "establishmentId", "serviceId", name, coalesce(duration::text, 'NULL'), "pdfNotice")
FROM "Thematic" WHERE name = :'name';

SELECT format(
  'INSERT INTO "SoignantThematic" ("soignantId", "thematicId", "establishmentId", "serviceId") VALUES (%L, %L, %L, %L);',
  l."soignantId", l."thematicId", l."establishmentId", l."serviceId")
FROM "SoignantThematic" l JOIN "Thematic" t ON t.id = l."thematicId"
WHERE t.name = :'name';

SELECT format(
  'UPDATE "Appointment" SET "thematicId" = %L WHERE id = %L AND "thematicId" IS NULL;',
  a."thematicId", a.id)
FROM "Appointment" a JOIN "Thematic" t ON t.id = a."thematicId"
WHERE t.name = :'name';

SELECT format(
  'UPDATE "SlotTemplate" SET "thematicId" = %L WHERE id = %L AND "thematicId" IS NULL;',
  s."thematicId", s.id)
FROM "SlotTemplate" s JOIN "Thematic" t ON t.id = s."thematicId"
WHERE t.name = :'name';

-- Garde-fou : les lignes a recoller doivent toujours exister en prod, sinon le
-- COMMIT ne passe pas et rien n'est applique.
SELECT 'COMMIT;';
