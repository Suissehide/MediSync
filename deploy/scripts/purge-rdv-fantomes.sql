-- Supprime les rendez-vous sans aucun patient : un reliquat d'import, pas un
-- rendez-vous. Ils faisaient archiver un creneau vide au lieu de le supprimer,
-- et bloquaient ses intervalles libres a la prise de rendez-vous.
--
-- Cause : un creneau passe d'individuel a collectif entre deux passages de
-- l'import. La ligne AppointmentPatient tire son id de l'id du rdv de l'ancien
-- site, donc la seconde insertion tombe dans le `ON CONFLICT DO NOTHING` et
-- laisse l'ancien Appointment orphelin. L'import fait ce menage lui-meme
-- depuis le 2026-10-29 ; ce fichier est pour une base ou il a deja tourne sans.
--
--   docker exec -i medisync-postgres psql -U postgres -d medisync \
--     -f - < deploy/scripts/purge-rdv-fantomes.sql
--
-- Rien n'est applique si un garde-fou saute : la transaction est abandonnee.

\set ON_ERROR_STOP on

BEGIN;

-- Ce qui va partir, avant de partir.
SELECT a.id, a."serviceId", a."startDate", a."slotID"
FROM "Appointment" a
WHERE NOT EXISTS (SELECT 1 FROM "AppointmentPatient" ap WHERE ap."appointmentId" = a.id)
ORDER BY a."startDate";

-- Garde-fou 1 : hors import, un rendez-vous sans patient voudrait dire que
-- l'application en cree. C'est un bug a regarder, pas une trace a effacer.
DO $$
DECLARE hors_import int;
BEGIN
  SELECT count(*) INTO hors_import FROM "Appointment" a
  -- `\_` : un underscore litteral, sinon LIKE le prend pour un joker et un
  -- identifiant applicatif commencant par « clgx » passerait pour un import.
  WHERE a.id NOT LIKE 'clgx\_%'
    AND NOT EXISTS (SELECT 1 FROM "AppointmentPatient" ap WHERE ap."appointmentId" = a.id);
  IF hors_import > 0 THEN
    RAISE EXCEPTION 'Rendez-vous sans patient hors import : %. Regarder avant d''effacer.', hors_import;
  END IF;
END $$;

CREATE TEMP TABLE purge_avant AS SELECT count(*) AS n FROM "AppointmentPatient";

DELETE FROM "Appointment" a
WHERE NOT EXISTS (SELECT 1 FROM "AppointmentPatient" ap WHERE ap."appointmentId" = a.id);

-- Garde-fou 2 : un rendez-vous sans patient n'a aucune inscription a entrainer
-- en cascade. Tout ecart dit que le filtre n'a pas fait ce qu'on croit.
DO $$
BEGIN
  IF (SELECT n FROM purge_avant) <> (SELECT count(*) FROM "AppointmentPatient") THEN
    RAISE EXCEPTION 'Des inscriptions ont disparu : % avant, % apres.',
      (SELECT n FROM purge_avant), (SELECT count(*) FROM "AppointmentPatient");
  END IF;
END $$;

COMMIT;
