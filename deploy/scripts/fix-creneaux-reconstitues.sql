-- Corrige les places des creneaux reconstitues par l'import de l'ancien site
-- (`clgx_st_o*`) : elles valaient le nombre de rendez-vous du groupe, un doublon
-- de l'ancien site donnait donc un collectif a 2 places avec un seul patient.
-- Les places comptent desormais les patients distincts, et le creneau redevient
-- individuel quand il n'y en a qu'un.
--
-- Rejouable : seules les lignes dont les places sont fausses sont touchees.
-- Inutile pour un import fait apres le correctif dans import-draxa.py.
--
--   docker exec -i medisync-postgres psql -U postgres -d medisync \
--     -f - < deploy/scripts/fix-creneaux-reconstitues.sql

\set ON_ERROR_STOP on

BEGIN;

WITH reel AS (
  SELECT t.id, count(DISTINCT ap."patientId") AS n_pat
    FROM "SlotTemplate" t
    JOIN "Slot" s ON s."slotTemplateID" = t.id
    JOIN "Appointment" a ON a."slotID" = s.id
    JOIN "AppointmentPatient" ap ON ap."appointmentId" = a.id
   WHERE t.id LIKE 'clgx_st_o%'
   GROUP BY t.id
)
UPDATE "SlotTemplate" t
   SET capacity = reel.n_pat, "isIndividual" = (reel.n_pat <= 1)
  FROM reel
 WHERE t.id = reel.id AND t.capacity <> reel.n_pat;

COMMIT;
