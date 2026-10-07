-- La suppression definitive d'un referentiel archive doit etre REFUSEE tant que
-- quelque chose le reference encore. `SetNull` laissait la base detruire ces
-- references en silence ; `Restrict` la fait refuser.
--
-- `SlotTemplateSoignant.soignant` passe de Cascade a Restrict pour la meme
-- raison : cette ligne dit qui anime la seance, c'est la donnee du planning.
-- `SoignantThematic` reste en Cascade : c'est de la configuration du
-- referentiel lui-meme, reconstructible, et l'exiger vide rendrait toute
-- suppression impraticable.

ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_thematicId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_thematicId_fkey"
  FOREIGN KEY ("thematicId") REFERENCES "Thematic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SlotTemplate" DROP CONSTRAINT "SlotTemplate_thematicId_fkey";
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_thematicId_fkey"
  FOREIGN KEY ("thematicId") REFERENCES "Thematic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SlotTemplate" DROP CONSTRAINT "SlotTemplate_locationID_fkey";
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_locationID_fkey"
  FOREIGN KEY ("locationID") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SlotTemplateSoignant" DROP CONSTRAINT "SlotTemplateSoignant_soignantId_serviceId_fkey";
ALTER TABLE "SlotTemplateSoignant" ADD CONSTRAINT "SlotTemplateSoignant_soignantId_serviceId_fkey"
  FOREIGN KEY ("soignantId", "serviceId") REFERENCES "Soignant"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceMembership" DROP CONSTRAINT "ServiceMembership_soignantId_fkey";
ALTER TABLE "ServiceMembership" ADD CONSTRAINT "ServiceMembership_soignantId_fkey"
  FOREIGN KEY ("soignantId") REFERENCES "Soignant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Todo" DROP CONSTRAINT "Todo_soignantID_fkey";
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_soignantID_fkey"
  FOREIGN KEY ("soignantID") REFERENCES "Soignant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DiagnosticEducatif" DROP CONSTRAINT "DiagnosticEducatif_templateId_fkey";
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "DiagnosticEducatifTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
