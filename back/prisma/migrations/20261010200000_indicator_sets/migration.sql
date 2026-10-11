BEGIN;
-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "completedChoiceKey" TEXT,
ADD COLUMN     "stopReasonFieldKey" TEXT;

-- CreateTable
CREATE TABLE "IndicatorSet" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "IndicatorSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicator" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "nature" TEXT NOT NULL,
    "measure" TEXT,
    "options" JSONB,
    "filters" JSONB,
    "breakdownField" TEXT,
    "input" TEXT,
    "note" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorAnswer" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "numberValue" INTEGER,
    "textValue" TEXT,
    "boolValue" BOOLEAN,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndicatorSet_serviceId_idx" ON "IndicatorSet"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorSet_id_serviceId_key" ON "IndicatorSet"("id", "serviceId");

-- CreateIndex
CREATE INDEX "Indicator_setId_idx" ON "Indicator"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "Indicator_setId_code_key" ON "Indicator"("setId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Indicator_id_serviceId_key" ON "Indicator"("id", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorAnswer_indicatorId_year_key" ON "IndicatorAnswer"("indicatorId", "year");

-- AddForeignKey
ALTER TABLE "IndicatorSet" ADD CONSTRAINT "IndicatorSet_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicator" ADD CONSTRAINT "Indicator_setId_serviceId_fkey" FOREIGN KEY ("setId", "serviceId") REFERENCES "IndicatorSet"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicator" ADD CONSTRAINT "Indicator_parentId_serviceId_fkey" FOREIGN KEY ("parentId", "serviceId") REFERENCES "Indicator"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorAnswer" ADD CONSTRAINT "IndicatorAnswer_indicatorId_serviceId_fkey" FOREIGN KEY ("indicatorId", "serviceId") REFERENCES "Indicator"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Grille ARS (générée depuis ARS_PRESET) posée sur chaque service ETP : champs orientation et stopReason.
CREATE TEMP TABLE ars_preset (code text, label text, grp text, ord int, nature text, measure text, options jsonb, filters jsonb, input text, note text, parent_code text);
INSERT INTO ars_preset VALUES
  ('1.1', 'Nombre de patients ayant bénéficié d''un diagnostic éducatif', 'Entrée', 0, 'computed', 'patientsEntres', '{}'::jsonb, NULL, NULL, NULL, NULL),
  ('1.1bis', 'Dont nombre de patients ayant bénéficié d''un diagnostic éducatif en distanciel', 'Entrée', 1, 'computed', 'patientsEntres', '{"diagnosticADistance":true}'::jsonb, NULL, NULL, NULL, '1.1'),
  ('1.2', 'Nombre de patients orientés par un professionnel de santé en dehors d''un hôpital (dont médecin traitant)', 'Entrée', 2, 'computed', 'patientsEntres', '{}'::jsonb, '[{"field":"orientation","op":"in","value":["ORIENTATION_PRO_SANTE_EXT"]}]'::jsonb, NULL, NULL, NULL),
  ('1.3', 'Nombre de patients orientés par un professionnel de santé au cours d''une hospitalisation', 'Entrée', 3, 'computed', 'patientsEntres', '{}'::jsonb, '[{"field":"orientation","op":"in","value":["ORIENTATION_PRO_SANTE_HOSPIT"]}]'::jsonb, NULL, NULL, NULL),
  ('1.4', 'Nombre de patients orientés par un professionnel de santé à l''hôpital en consultation externe', 'Entrée', 4, 'computed', 'patientsEntres', '{}'::jsonb, '[{"field":"orientation","op":"in","value":["ORIENTATION_PRO_SANTE_CS"]}]'::jsonb, NULL, NULL, NULL),
  ('2.1', 'Nombre de patients pris en charge au cours d''une hospitalisation (de jour, de semaine, complète) en établissement de santé uniquement', 'Séances', 5, 'computed', 'patientsParModalite', '{"modalite":"hospitalisation"}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.2', 'Nombre de patients pris en charge en soins externes d''un établissement de santé uniquement', 'Séances', 6, 'computed', 'patientsParModalite', '{"modalite":"externes"}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.3', 'Nombre de patients pris en charge en soins de ville uniquement (MSP, association, ex-réseau de PS libéraux…)', 'Séances', 7, 'unavailable', NULL, NULL, NULL, NULL, 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique', NULL),
  ('2.4', 'Nombre de patients pris en charge en programme mixte (hospitalisation + soins externes)', 'Séances', 8, 'computed', 'patientsParModalite', '{"modalite":"mixte"}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.5', 'Autre type de prise en charge à chiffrer et à expliquer', 'Séances', 9, 'manual', NULL, NULL, NULL, 'number+text', 'Champ libre de l''enquête, à renseigner à la main', NULL),
  ('2.6', 'Nombre total de séances individuelles d''ETP réalisées', 'Séances', 10, 'computed', 'seancesIndividuelles', '{"aDistance":false}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.6bis', 'Dont nombre de séances individuelles d''ETP réalisées en distanciel', 'Séances', 11, 'computed', 'seancesIndividuelles', '{"aDistance":true}'::jsonb, NULL, NULL, NULL, '2.6'),
  ('2.7', 'Nombre total de séances collectives d''ETP réalisées', 'Séances', 12, 'computed', 'seancesCollectives', '{"aDistance":false}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.7bis', 'Dont nombre de séances collectives d''ETP réalisées en distanciel', 'Séances', 13, 'computed', 'seancesCollectives', '{"aDistance":true}'::jsonb, NULL, NULL, NULL, '2.7'),
  ('2.8', 'Nombre moyen de patients par séance collective', 'Séances', 14, 'computed', 'moyennePatientsParSeanceCollective', '{}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.9', 'Nombre de proches et/ou aidants du patient ayant participé au programme', 'Séances', 15, 'computed', 'patientsAccompagnes', '{}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.10', 'Nombre total de séances d''ETP avec une participation de proches et/ou aidants du patient', 'Séances', 16, 'computed', 'seancesAvecProche', '{}'::jsonb, NULL, NULL, NULL, NULL),
  ('2.11', 'Nombre total de séances destinées exclusivement aux proches et/ou aidants du patient', 'Séances', 17, 'unavailable', NULL, NULL, NULL, NULL, 'Un rendez-vous est toujours rattaché à des patients : une séance sans patient ne se représente pas', NULL),
  ('3.1', 'Nombre de patients ayant suivi un programme personnalisé complet (quel que soit le mode de prise en charge)', 'Sortie', 18, 'computed', 'patientsProgrammeComplet', '{"modalite":"toutes"}'::jsonb, NULL, NULL, NULL, NULL),
  ('3.2', 'Nombre de patients ayant suivi un programme personnalisé complet (au cours d''une hospitalisation complète ou de jour)', 'Sortie', 19, 'computed', 'patientsProgrammeComplet', '{"modalite":"hospitalisation"}'::jsonb, NULL, NULL, NULL, NULL),
  ('3.3', 'Nombre de patients ayant suivi un programme personnalisé complet (au cours d''une venue en soins externes)', 'Sortie', 20, 'computed', 'patientsProgrammeComplet', '{"modalite":"externes"}'::jsonb, NULL, NULL, NULL, NULL),
  ('3.4', 'Nombre de patients ayant suivi un programme personnalisé complet (au cours d’une venue mixte)', 'Sortie', 21, 'computed', 'patientsProgrammeComplet', '{"modalite":"mixte"}'::jsonb, NULL, NULL, NULL, NULL),
  ('3.5', 'Nombre de patients ayant suivi un programme personnalisé complet (au cours de séances d''ETP pratiquées en soins de ville)', 'Sortie', 22, 'unavailable', NULL, NULL, NULL, NULL, 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique', NULL),
  ('3.6', 'Nombre de patients ayant bénéficié d''une évaluation individuelle des compétences acquises de l''ETP', 'Sortie', 23, 'computed', 'patientsEvalues', '{}'::jsonb, NULL, NULL, NULL, NULL),
  ('4.1', 'Nombre de patients ayant bénéficié d''un programme personnalisé lors d''une offre initiale d''ETP', 'Modalités', 24, 'computed', 'patientsProgrammePersonnalise', '{"variante":"initial"}'::jsonb, NULL, NULL, NULL, NULL),
  ('4.1bis', 'Dont nombre de patients ayant terminé par une réactualisation (Réactu 1 à 4)', 'Modalités', 25, 'computed', 'patientsProgrammePersonnalise', '{"variante":"initialTermineParReactu"}'::jsonb, NULL, NULL, NULL, '4.1'),
  ('4.2', 'Une offre de suivi ou de renforcement dans un nouveau programme est-elle proposée au sein de la structure ?', 'Modalités', 26, 'manual', NULL, NULL, NULL, 'yesno', 'Question oui/non sur la structure, à renseigner à la main', NULL),
  ('4.3', 'Nombre de patients ayant bénéficié d''un programme personnalisé lors d''une offre de suivi ou de renforcement d''ETP commençant par une réactualisation', 'Modalités', 27, 'computed', 'patientsProgrammePersonnalise', '{"variante":"suiviCommenceParReactu"}'::jsonb, NULL, NULL, NULL, NULL),
  ('4.3bis', 'Dont nombre de patients ayant également terminé par une réactualisation (Réactu 1 à 4)', 'Modalités', 28, 'computed', 'patientsProgrammePersonnalise', '{"variante":"suiviReactuDebutEtFin"}'::jsonb, NULL, NULL, NULL, '4.3'),
  ('4.4', 'Nombre de patients dont la synthèse de l''évaluation des compétences acquises a été transmise au moins à leur médecin traitant', 'Modalités', 29, 'unavailable', NULL, NULL, NULL, NULL, 'Aucun modèle ne trace cet envoi (relève du ticket « Envoi du bilan par MSSanté »)', NULL);

CREATE TEMP TABLE etp_services ON COMMIT DROP AS
SELECT s.id, s."establishmentId" FROM "Service" s
WHERE EXISTS (SELECT 1 FROM "ServiceFieldDefinition" d WHERE d."serviceId" = s.id AND d.key = 'orientation')
  AND EXISTS (SELECT 1 FROM "ServiceFieldDefinition" d WHERE d."serviceId" = s.id AND d.key = 'stopReason');

INSERT INTO "IndicatorSet" (id, "establishmentId", "serviceId", name, "order")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), e."establishmentId", e.id, 'Grille ARS', 0
FROM etp_services e;

INSERT INTO "Indicator" (id, "establishmentId", "serviceId", "setId", code, label, "group", "order", nature, measure, options, filters, input, note)
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), s."establishmentId", s."serviceId", s.id,
       p.code, p.label, p.grp, p.ord, p.nature, p.measure, p.options, p.filters, p.input, p.note
FROM "IndicatorSet" s CROSS JOIN ars_preset p;

UPDATE "Indicator" i SET "parentId" = parent.id
FROM ars_preset p JOIN "Indicator" parent ON parent.code = p.parent_code
WHERE p.code = i.code AND parent."setId" = i."setId";

UPDATE "Service" SET "stopReasonFieldKey" = 'stopReason', "completedChoiceKey" = 'PLUS_BESOIN_FIN_PARCOURS'
WHERE id IN (SELECT id FROM etp_services);

INSERT INTO "IndicatorAnswer" (id, "establishmentId", "serviceId", "indicatorId", year, "numberValue", "textValue", "boolValue", "updatedById", "updatedAt")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), a."establishmentId", a."serviceId", i.id, a.year,
       a."numberValue", a."textValue", a."boolValue", a."updatedById", a."updatedAt"
FROM "ArsManualAnswer" a
JOIN "IndicatorSet" s ON s."serviceId" = a."serviceId" AND s.name = 'Grille ARS'
JOIN "Indicator" i ON i."setId" = s.id AND i.code = a.code;

-- Garde : autant de réponses qu'avant, chacune retrouvée à l'identique.
DO $$
DECLARE avant int; apres int; manquantes int;
BEGIN
  SELECT count(*) INTO avant FROM "ArsManualAnswer";
  SELECT count(*) INTO apres FROM "IndicatorAnswer";
  SELECT count(*) INTO manquantes FROM (
    SELECT "serviceId", year, code, "numberValue", "textValue", "boolValue" FROM "ArsManualAnswer"
    EXCEPT
    SELECT a."serviceId", a.year, i.code, a."numberValue", a."textValue", a."boolValue"
    FROM "IndicatorAnswer" a JOIN "Indicator" i ON i.id = a."indicatorId"
  ) x;
  IF avant <> apres OR manquantes > 0 THEN
    RAISE EXCEPTION 'Migration indicator_sets refusee : reponses non reprises (% avant, % apres, % manquantes)', avant, apres, manquantes;
  END IF;
END $$;

-- DropTable
DROP TABLE "ArsManualAnswer";

DROP TABLE ars_preset;
COMMIT;
