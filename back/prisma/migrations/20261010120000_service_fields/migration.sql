BEGIN;
-- AlterTable
ALTER TABLE "PatientServiceFile" ADD COLUMN     "clinicalData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "data" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ServiceFieldDefinition" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "clinical" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFieldChoice" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceFieldChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceFieldDefinition_serviceId_idx" ON "ServiceFieldDefinition"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldDefinition_serviceId_key_key" ON "ServiceFieldDefinition"("serviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldDefinition_id_serviceId_key" ON "ServiceFieldDefinition"("id", "serviceId");

-- CreateIndex
CREATE INDEX "ServiceFieldChoice_fieldId_idx" ON "ServiceFieldChoice"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFieldChoice_fieldId_key_key" ON "ServiceFieldChoice"("fieldId", "key");

-- AddForeignKey
ALTER TABLE "ServiceFieldDefinition" ADD CONSTRAINT "ServiceFieldDefinition_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFieldChoice" ADD CONSTRAINT "ServiceFieldChoice_fieldId_serviceId_fkey" FOREIGN KEY ("fieldId", "serviceId") REFERENCES "ServiceFieldDefinition"("id", "serviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Définitions ETP pour chaque service existant (ordre = ordre du catalogue ETP_FIELD_PRESET).
CREATE TEMP TABLE etp_fields (key text, label text, type text, section text, ord int, clinical boolean);
INSERT INTO etp_fields VALUES
  ('medicalDiagnosis', 'Diagnostic médical', 'choice', 'pathway', 0, true),
  ('careMode', 'Mode de prise en charge', 'choice', 'pathway', 1, false),
  ('orientation', 'Orientation', 'choice', 'pathway', 2, false),
  ('etpDecision', 'ETP décision', 'choice', 'pathway', 3, false),
  ('programType', 'Type de programme', 'choice', 'pathway', 4, false),
  ('nonInclusionDetails', 'Précision non inclusion', 'choice', 'pathway', 5, false),
  ('customContentDetails', 'Précision contenu personnalisé', 'longtext', 'pathway', 6, false),
  ('goal', 'Objectif', 'longtext', 'pathway', 7, false),
  ('stopReason', 'Motif d''arrêt de programme', 'choice', 'outcome', 8, false),
  ('etpFinalOutcome', 'Point final parcours ETP', 'choice', 'outcome', 9, false);

CREATE TEMP TABLE etp_choices (field text, key text, label text, ord int);
INSERT INTO etp_choices VALUES
  ('medicalDiagnosis', 'AOMI', 'AOMI', 0),
  ('medicalDiagnosis', 'AVC', 'AVC', 1),
  ('medicalDiagnosis', 'CORONAROPATHIE', 'CORONAROPATHIE', 2),
  ('medicalDiagnosis', 'PREVENTION', 'PREVENTION', 3),
  ('careMode', 'AMBU', 'Ambu', 0),
  ('careMode', 'HDJ', 'HDJ', 1),
  ('careMode', 'HDS', 'HDS', 2),
  ('careMode', 'HOSPIT', 'Hospit', 3),
  ('orientation', 'NS', 'NS', 0),
  ('orientation', 'ORIENTATION_PRO_SANTE_HOSPIT', 'Orientation pro santé au cours hospit', 1),
  ('orientation', 'ORIENTATION_PRO_SANTE_CS', 'Orientation pro santé en Cs', 2),
  ('orientation', 'ORIENTATION_PRO_SANTE_EXT', 'Orientation pro santé ext hôpital', 3),
  ('orientation', 'VENUE_SPONTANEE', 'Venue spontanée', 4),
  ('etpDecision', 'NON', 'Non', 0),
  ('etpDecision', 'OUI', 'Oui', 1),
  ('programType', 'VIVA', 'ViVa', 0),
  ('programType', 'VIVA_AOMI', 'ViVa module AOMI', 1),
  ('nonInclusionDetails', 'ABSENCE_BESOINS_EDUCATIFS', 'Absence de besoins éducatifs', 0),
  ('nonInclusionDetails', 'ABSENCE_CRITERES_MEDICAUX', 'Absence de critères médicaux d''inclusion', 1),
  ('nonInclusionDetails', 'BARRIERE_LANGUE', 'Barrière de la langue', 2),
  ('nonInclusionDetails', 'DISTANCE_HABITATION', 'Distance  d''habitation', 3),
  ('nonInclusionDetails', 'INDISPONIBILITE', 'Indisponibilité', 4),
  ('nonInclusionDetails', 'MANQUE_MOTIVATION', 'Manque de motivation', 5),
  ('nonInclusionDetails', 'NS', 'NS', 6),
  ('nonInclusionDetails', 'PRISE_CHARGE_BESOINS_QUOTIDIENS', 'Prise en charge des besoins quotidiens', 7),
  ('nonInclusionDetails', 'PROBLEME_SANTE', 'Problème de santé', 8),
  ('nonInclusionDetails', 'PROBLEMES_MEDICAUX', 'Problèmes médicaux à régler', 9),
  ('nonInclusionDetails', 'REFUS', 'Refus', 10),
  ('nonInclusionDetails', 'TRANSPORT', 'Transport', 11),
  ('nonInclusionDetails', 'TROUBLES_COGNITIFS', 'Troubles cognitifs', 12),
  ('nonInclusionDetails', 'TROUBLES_PSYCHIATRIQUES', 'Troubles psychiatriques', 13),
  ('stopReason', 'ABSENCE_BESOINS_EDUCATIFS', 'Absence besoins éducatifs', 0),
  ('stopReason', 'ABSENCE_CRITERES_MEDICAUX', 'Absence de critères médicaux d''inclusion', 1),
  ('stopReason', 'BARRIERE_LANGUE', 'Barrière de la langue', 2),
  ('stopReason', 'DISTANCE_HABITATION', 'Distance d''habitation', 3),
  ('stopReason', 'DECES', 'Décès', 4),
  ('stopReason', 'DEMENAGEMENT', 'Déménagement', 5),
  ('stopReason', 'INDISPONIBILITE', 'Indisponibilité', 6),
  ('stopReason', 'MANQUE_MOTIVATION', 'Manque de motivation', 7),
  ('stopReason', 'NS', 'NS', 8),
  ('stopReason', 'PERDU_DE_VUE', 'Perdu de vue', 9),
  ('stopReason', 'PLUS_BESOIN_FIN_PARCOURS', 'Plus de besoin/Fin de parcours', 10),
  ('stopReason', 'PRISE_CHARGE_BESOINS_QUOTIDIENS', 'Prise en charge besoins quotidiens', 11),
  ('stopReason', 'PROBLEME_SANTE', 'Problème de santé', 12),
  ('stopReason', 'PROBLEMES_MEDICAUX', 'Problèmes médicaux à régler', 13),
  ('stopReason', 'REFUS', 'Refus', 14),
  ('stopReason', 'SOUHAIT_ARRET', 'Souhait arrêt', 15),
  ('stopReason', 'TRANSPORT', 'Transport', 16),
  ('stopReason', 'TROUBLES_COGNITIFS', 'Troubles cognitifs', 17),
  ('stopReason', 'TROUBLES_PSYCHIATRIQUES', 'Troubles psychiatriques', 18),
  ('etpFinalOutcome', 'ATELIER', 'Atelier', 0),
  ('etpFinalOutcome', 'ATELIER_INFORMATION', 'Atelier information', 1),
  ('etpFinalOutcome', 'BCVS', 'BCVs', 2),
  ('etpFinalOutcome', 'CONSULTATION', 'Consultation', 3),
  ('etpFinalOutcome', 'DE', 'DE', 4),
  ('etpFinalOutcome', 'ENTRETIEN_INDIVIDUEL', 'Entretien individuel', 5),
  ('etpFinalOutcome', 'M12', 'M12', 6),
  ('etpFinalOutcome', 'M3', 'M3', 7),
  ('etpFinalOutcome', 'RENF1', 'Renf1', 8),
  ('etpFinalOutcome', 'RENF2', 'Renf2', 9),
  ('etpFinalOutcome', 'SUIVI_TELEPHONIQUE', 'Suivi téléphonique', 10);

INSERT INTO "ServiceFieldDefinition" (id, "establishmentId", "serviceId", key, label, type, section, "order", clinical)
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), s."establishmentId", s.id, f.key, f.label, f.type, f.section, f.ord, f.clinical
FROM "Service" s CROSS JOIN etp_fields f;

INSERT INTO "ServiceFieldChoice" (id, "establishmentId", "serviceId", "fieldId", key, label, "order")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), d."establishmentId", d."serviceId", d.id, c.key, c.label, c.ord
FROM "ServiceFieldDefinition" d JOIN etp_choices c ON c.field = d.key;

-- Valeurs saisies hors des constantes : choix archivés, libellé = clé, pour ne rien perdre.
INSERT INTO "ServiceFieldChoice" (id, "establishmentId", "serviceId", "fieldId", key, label, "order", "archivedAt")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), d."establishmentId", d."serviceId", d.id, v.value, v.value,
       1000 + row_number() OVER (PARTITION BY d.id ORDER BY v.value), now()
FROM (
  SELECT DISTINCT "serviceId", x.field, x.value
  FROM "PatientServiceFile" f
  CROSS JOIN LATERAL (VALUES
    ('medicalDiagnosis', NULLIF(f."medicalDiagnosis", '')),
    ('careMode', NULLIF(f."careMode", '')),
    ('orientation', NULLIF(f."orientation", '')),
    ('etpDecision', NULLIF(f."etpDecision", '')),
    ('programType', NULLIF(f."programType", '')),
    ('nonInclusionDetails', NULLIF(f."nonInclusionDetails", '')),
    ('stopReason', NULLIF(f."stopReason", '')),
    ('etpFinalOutcome', NULLIF(f."etpFinalOutcome", ''))
  ) AS x(field, value)
  WHERE x.value IS NOT NULL
) v
JOIN "ServiceFieldDefinition" d ON d."serviceId" = v."serviceId" AND d.key = v.field
WHERE NOT EXISTS (SELECT 1 FROM etp_choices c WHERE c.field = v.field AND c.key = v.value);

-- Recopie : une chaîne vide vaut absence.
UPDATE "PatientServiceFile" SET
  data = jsonb_strip_nulls(jsonb_build_object(
    'careMode', NULLIF("careMode", ''),
    'orientation', NULLIF("orientation", ''),
    'etpDecision', NULLIF("etpDecision", ''),
    'programType', NULLIF("programType", ''),
    'nonInclusionDetails', NULLIF("nonInclusionDetails", ''),
    'customContentDetails', NULLIF("customContentDetails", ''),
    'goal', NULLIF("goal", ''),
    'stopReason', NULLIF("stopReason", ''),
    'etpFinalOutcome', NULLIF("etpFinalOutcome", '')
  )),
  "clinicalData" = jsonb_strip_nulls(jsonb_build_object('medicalDiagnosis', NULLIF("medicalDiagnosis", '')));

-- Garde : chaque valeur non vide doit se retrouver, à l'identique, dans la colonne JSON attendue.
DO $$
DECLARE fautif text;
BEGIN
  SELECT string_agg(field, ', ') INTO fautif FROM (
    SELECT 'medicalDiagnosis' AS field WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("medicalDiagnosis", '') IS DISTINCT FROM "clinicalData"->>'medicalDiagnosis')
    UNION ALL SELECT 'careMode' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("careMode", '') IS DISTINCT FROM data->>'careMode')
    UNION ALL SELECT 'orientation' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("orientation", '') IS DISTINCT FROM data->>'orientation')
    UNION ALL SELECT 'etpDecision' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("etpDecision", '') IS DISTINCT FROM data->>'etpDecision')
    UNION ALL SELECT 'programType' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("programType", '') IS DISTINCT FROM data->>'programType')
    UNION ALL SELECT 'nonInclusionDetails' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("nonInclusionDetails", '') IS DISTINCT FROM data->>'nonInclusionDetails')
    UNION ALL SELECT 'customContentDetails' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("customContentDetails", '') IS DISTINCT FROM data->>'customContentDetails')
    UNION ALL SELECT 'goal' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("goal", '') IS DISTINCT FROM data->>'goal')
    UNION ALL SELECT 'stopReason' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("stopReason", '') IS DISTINCT FROM data->>'stopReason')
    UNION ALL SELECT 'etpFinalOutcome' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("etpFinalOutcome", '') IS DISTINCT FROM data->>'etpFinalOutcome')
  ) x;
  IF fautif IS NOT NULL THEN
    RAISE EXCEPTION 'Migration service_fields refusee : valeurs non recopiees pour %', fautif;
  END IF;
END $$;

ALTER TABLE "PatientServiceFile"
  DROP COLUMN "medicalDiagnosis", DROP COLUMN "careMode", DROP COLUMN "orientation",
  DROP COLUMN "etpDecision", DROP COLUMN "programType", DROP COLUMN "nonInclusionDetails",
  DROP COLUMN "customContentDetails", DROP COLUMN "goal", DROP COLUMN "stopReason",
  DROP COLUMN "etpFinalOutcome";

DROP TABLE etp_fields, etp_choices;
COMMIT;
