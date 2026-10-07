-- Archivage des salles, soignants et modeles de diagnostic educatif : remplace la
-- suppression, qui vidait les references des creneaux modeles, des taches, des
-- affectations de membres et des diagnostics deja remplis — et, pour un soignant,
-- effacait carrement ses lignes de liaison (onDelete: Cascade).
ALTER TABLE "Location" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Soignant" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "DiagnosticEducatifTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);
