BEGIN;
-- AlterTable
ALTER TABLE "PdfDesign" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Les designs qui existent deja ont ete composes AVANT l'arrivee des brouillons : ils sont
-- proposes a l'export aujourd'hui, et le rester est la seule migration qui ne change rien
-- pour personne. Un design cree apres cette migration, lui, nait brouillon.
UPDATE "PdfDesign" SET "publishedAt" = "createdAt";
COMMIT;
