-- Archivage des thematiques : remplace la suppression, qui vidait le
-- `thematicId` de tous les rendez-vous deja crees (onDelete: SetNull).
ALTER TABLE "Thematic" ADD COLUMN "archivedAt" TIMESTAMP(3);
