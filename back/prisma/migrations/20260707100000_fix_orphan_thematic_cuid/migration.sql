-- The previous migration (thematic string -> FK) created orphan Thematic rows
-- with UUID ids via gen_random_uuid(). Those ids contain hyphens and fail the
-- application's z.cuid() validation, breaking response serialization for any
-- appointment / slot-template pointing at them.
--
-- Reassign a cuid-compatible id ('c' + 32 hex chars, no hyphens) to every
-- Thematic whose id still looks like a UUID. The Thematic FK is declared
-- ON UPDATE CASCADE, so Appointment.thematicId and SlotTemplate.thematicId
-- (and the implicit Soignant<->Thematic join) follow automatically.
UPDATE "Thematic"
SET "id" = 'c' || replace(gen_random_uuid()::text, '-', '')
WHERE "id" LIKE '%-%';
