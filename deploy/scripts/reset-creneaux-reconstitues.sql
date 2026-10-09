-- Supprime les creneaux reconstitues par un import precedent (`clgx_*_o*`) pour
-- que l'import les recree avec le decoupage courant : un rdv de l'ancien site
-- sans creneau est individuel, sauf dans les categories multi-patients
-- (atelier, educative, coaching).
--
-- A jouer AVANT de rejouer l'import, sinon `ON CONFLICT DO NOTHING` garde les
-- anciens creneaux et le nouveau decoupage n'arrive qu'a moitie.
--
-- Ne touche que des lignes issues de l'import : si la sortie annonce des
-- rendez-vous ou des inscriptions hors import (ids sans prefixe `clgx_`),
-- ARRETER et regarder, ce sont des saisies faites dans l'application.
--
--   docker exec -i medisync-postgres psql -U postgres -d medisync \
--     -f - < deploy/scripts/reset-creneaux-reconstitues.sql

\set ON_ERROR_STOP on

BEGIN;

SELECT count(*) AS "rdv hors import sur ces creneaux"
  FROM "Appointment" a
  JOIN "Slot" s ON s.id = a."slotID"
 WHERE s.id LIKE 'clgx_sl_o%' AND a.id NOT LIKE 'clgx_%';

SELECT count(*) AS "inscriptions hors import sur ces creneaux"
  FROM "AppointmentPatient" ap
  JOIN "Appointment" a ON a.id = ap."appointmentId"
  JOIN "Slot" s ON s.id = a."slotID"
 WHERE s.id LIKE 'clgx_sl_o%' AND ap.id NOT LIKE 'clgx_%';

-- Appointment et AppointmentPatient partent en cascade avec le Slot,
-- SlotTemplateSoignant avec le SlotTemplate.
DELETE FROM "Slot" WHERE id LIKE 'clgx_sl_o%';
DELETE FROM "SlotTemplate" WHERE id LIKE 'clgx_st_o%';

COMMIT;
