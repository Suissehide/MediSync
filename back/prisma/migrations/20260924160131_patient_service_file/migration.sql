-- Garde du service unique. Les seize colonnes de parcours d'un patient sont uniques : les
-- répartir au jugé entre plusieurs services produirait une perte silencieuse, le pire résultat
-- possible sur des données de santé. Le prédicat exact est : tout établissement ayant au moins
-- un patient doit avoir exactement un service. Un établissement sans patient est inoffensif
-- quel que soit son nombre de services (0, 1 ou plus) : la jointure du remplissage ci-dessous
-- ne le concerne jamais, rien n'y sera recopié ni perdu.
--
-- Cette garde est volontairement la toute première instruction du fichier, avant même la
-- création de la table : si elle lève, rigoureusement aucune donnée n'a encore été touchée,
-- pas même par une création de table vide.
--
-- Deux causes distinctes, deux messages distincts, parce que le remède n'est pas le même :
-- un établissement à plusieurs services demande une procédure de répartition guidée ; un
-- établissement sans service en demande simplement un.
DO $$
DECLARE trop_de_services text;
DECLARE aucun_service text;
BEGIN
  -- Spec §4.1 : le message doit nommer les etablissements fautifs ET leurs services, pas
  -- seulement leur nombre — un operateur doit pouvoir agir sur ce seul message, sans requete
  -- supplementaire pour savoir quels services repartir.
  SELECT string_agg(x.etab || ' (' || x.services || ')', ', ')
  INTO trop_de_services
  FROM (
    SELECT e.id, e.name AS etab, string_agg(s.name, ', ' ORDER BY s.name) AS services
    FROM "Service" s
    JOIN "Establishment" e ON e.id = s."establishmentId"
    WHERE EXISTS (SELECT 1 FROM "Patient" p WHERE p."establishmentId" = s."establishmentId")
    GROUP BY e.id, e.name
    HAVING count(DISTINCT s.id) > 1
  ) x;

  IF trop_de_services IS NOT NULL THEN
    RAISE EXCEPTION 'Migration refusee : ces etablissements ont des patients et plusieurs services (%). '
      'Les colonnes de parcours d''un patient sont uniques et ne peuvent pas etre reparties '
      'automatiquement entre plusieurs sous-dossiers. Une procedure guidee est necessaire.', trop_de_services;
  END IF;

  SELECT string_agg(e.name, ', ')
  INTO aucun_service
  FROM "Establishment" e
  WHERE EXISTS (SELECT 1 FROM "Patient" p WHERE p."establishmentId" = e.id)
    AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s."establishmentId" = e.id);

  IF aucun_service IS NOT NULL THEN
    RAISE EXCEPTION 'Migration refusee : ces etablissements ont des patients mais aucun service (%). '
      'Sans service, aucun sous-dossier ne peut etre cree : les seize colonnes seraient '
      'supprimees sans recopie. Creer un service avant de redeployer.', aucun_service;
  END IF;
END $$;

-- CreateTable
CREATE TABLE "PatientServiceFile" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "referringCaregiver" TEXT,
    "followUpToDo" TEXT,
    "notes" TEXT,
    "details" TEXT,
    "medicalDiagnosis" TEXT,
    "entryDate" DATE,
    "careMode" TEXT,
    "orientation" TEXT,
    "etpDecision" TEXT,
    "programType" TEXT,
    "nonInclusionDetails" TEXT,
    "customContentDetails" TEXT,
    "goal" TEXT,
    "exitDate" DATE,
    "stopReason" TEXT,
    "etpFinalOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientServiceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientServiceFile_serviceId_idx" ON "PatientServiceFile"("serviceId");

-- CreateIndex
CREATE INDEX "PatientServiceFile_patientId_idx" ON "PatientServiceFile"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientServiceFile_patientId_serviceId_key" ON "PatientServiceFile"("patientId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientServiceFile_id_serviceId_key" ON "PatientServiceFile"("id", "serviceId");

-- AddForeignKey
ALTER TABLE "PatientServiceFile" ADD CONSTRAINT "PatientServiceFile_patientId_establishmentId_fkey" FOREIGN KEY ("patientId", "establishmentId") REFERENCES "Patient"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientServiceFile" ADD CONSTRAINT "PatientServiceFile_serviceId_establishmentId_fkey" FOREIGN KEY ("serviceId", "establishmentId") REFERENCES "Service"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remplir : un sous-dossier par patient, dans l'unique service de son etablissement (garanti
-- par la garde ci-dessus). `createdAt` recopie `Patient."createDate"` : le sous-dossier est la
-- continuation de cet enregistrement, pas un enregistrement neuf. Le dater d'aujourd'hui
-- inscrirait en base un petit mensonge sur des donnees de parcours parfois saisies des annees
-- plus tot, irreversible une fois les colonnes source supprimees plus bas.
--
-- L'identifiant doit avoir la forme que l'application accepte : `schema.prisma` declare
-- `id String @id @default(cuid())` et les schemas Zod du depot valident les identifiants de
-- reponse avec `z.cuid()` (regex `^[cC][^\s-]{8,}$`). Un UUID (avec ses tirets) echoue a ce
-- test. `'c' || replace(gen_random_uuid()::text, '-', '')` prefixe la lettre 'c' attendue et
-- retire les tirets qui le feraient rejeter, tout en gardant l'aleatoire de gen_random_uuid()
-- pour l'unicite — ce n'est pas un vrai cuid (l'algorithme n'est pas reimplemente en SQL),
-- seulement une valeur de la forme que le validateur du depot accepte.
INSERT INTO "PatientServiceFile" (
  id, "patientId", "serviceId", "establishmentId",
  "referringCaregiver", "followUpToDo", notes, details,
  "medicalDiagnosis", "entryDate", "careMode", orientation, "etpDecision",
  "programType", "nonInclusionDetails", "customContentDetails", goal,
  "exitDate", "stopReason", "etpFinalOutcome", "createdAt"
)
SELECT
  'c' || replace(gen_random_uuid()::text, '-', ''), p.id, s.id, p."establishmentId",
  p."referringCaregiver", p."followUpToDo", p.notes, p.details,
  p."medicalDiagnosis", p."entryDate", p."careMode", p.orientation, p."etpDecision",
  p."programType", p."nonInclusionDetails", p."customContentDetails", p.goal,
  p."exitDate", p."stopReason", p."etpFinalOutcome", p."createDate"
FROM "Patient" p
JOIN "Service" s ON s."establishmentId" = p."establishmentId";

-- Rattacher les enfants au sous-dossier desormais rempli. Ces deux contraintes ne peuvent pas
-- etre posees plus haut, avec les deux precedentes : "PatientServiceFile" etait encore vide a
-- ce moment-la, et la base peut deja porter des diagnostics et des problemes d'inscription —
-- l'ajout de la contrainte aurait echoue en validation plutot que d'attendre le remplissage.
-- AddForeignKey
ALTER TABLE "EnrollmentIssue" ADD CONSTRAINT "EnrollmentIssue_patientId_serviceId_fkey" FOREIGN KEY ("patientId", "serviceId") REFERENCES "PatientServiceFile"("patientId", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEducatif" ADD CONSTRAINT "DiagnosticEducatif_patientId_serviceId_fkey" FOREIGN KEY ("patientId", "serviceId") REFERENCES "PatientServiceFile"("patientId", "serviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nettoyer : les seize colonnes ont ete recopiees plus haut, elles quittent "Patient".
-- AlterTable
ALTER TABLE "Patient"
  DROP COLUMN "referringCaregiver",
  DROP COLUMN "followUpToDo",
  DROP COLUMN "notes",
  DROP COLUMN "details",
  DROP COLUMN "medicalDiagnosis",
  DROP COLUMN "entryDate",
  DROP COLUMN "careMode",
  DROP COLUMN "orientation",
  DROP COLUMN "etpDecision",
  DROP COLUMN "programType",
  DROP COLUMN "nonInclusionDetails",
  DROP COLUMN "customContentDetails",
  DROP COLUMN "goal",
  DROP COLUMN "exitDate",
  DROP COLUMN "stopReason",
  DROP COLUMN "etpFinalOutcome";
