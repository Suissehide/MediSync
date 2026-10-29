BEGIN;
-- AlterTable
ALTER TABLE "PdfDesignPreset" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Les modeles livres qui existent deja sont proposes aux services aujourd'hui : les laisser
-- termines est la seule migration qui ne change rien pour personne. Un modele cree apres
-- cette migration, lui, nait brouillon.
UPDATE "PdfDesignPreset" SET "publishedAt" = "createdAt";
COMMIT;
