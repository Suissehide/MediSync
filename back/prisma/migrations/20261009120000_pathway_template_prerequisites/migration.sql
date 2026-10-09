-- Parcours prérequis : le patient doit avoir terminé ces parcours avant de commencer celui-ci.
ALTER TABLE "PathwayTemplate" ADD COLUMN "prerequisiteIDs" TEXT[] DEFAULT ARRAY[]::TEXT[];
