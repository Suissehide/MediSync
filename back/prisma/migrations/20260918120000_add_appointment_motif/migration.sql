-- Motif du rendez-vous : texte libre saisi à la prise de rendez-vous sur un
-- créneau individuel. Nullable — les rendez-vous déjà en base et ceux des
-- créneaux collectifs n'en ont pas.
ALTER TABLE "Appointment" ADD COLUMN "motif" TEXT;
