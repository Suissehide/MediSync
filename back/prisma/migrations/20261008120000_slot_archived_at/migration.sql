-- Archivage des creneaux : les masque du Planning sans toucher a leurs rendez-vous.
ALTER TABLE "Slot" ADD COLUMN "archivedAt" TIMESTAMP(3);
