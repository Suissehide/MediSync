-- À jouer AVANT la migration patient_service_file. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à celle de dossier-patient.sql jouée APRÈS : toute valeur
-- différente signale une perte, une recopie vide ou un décalage.
--
-- Les comptages seuls ne suffisent PAS ici : les lignes ne se déplacent pas, ce sont les
-- valeurs qui changent de table. Une recopie décalée d'une ligne garderait des comptages
-- identiques. D'où la somme de contrôle sur le contenu ordonné, qui, elle, la détecte.

SELECT 'Patients' AS check, count(*)::text AS value FROM "Patient"
UNION ALL SELECT 'Etablissements', count(*)::text FROM "Establishment"
UNION ALL SELECT 'Services', count(*)::text FROM "Service"

-- Presence : une ligne par colonne qui demenage.
UNION ALL SELECT 'Presence medicalDiagnosis', count("medicalDiagnosis")::text FROM "Patient"
UNION ALL SELECT 'Presence entryDate', count("entryDate")::text FROM "Patient"
UNION ALL SELECT 'Presence careMode', count("careMode")::text FROM "Patient"
UNION ALL SELECT 'Presence orientation', count("orientation")::text FROM "Patient"
UNION ALL SELECT 'Presence etpDecision', count("etpDecision")::text FROM "Patient"
UNION ALL SELECT 'Presence programType', count("programType")::text FROM "Patient"
UNION ALL SELECT 'Presence nonInclusionDetails', count("nonInclusionDetails")::text FROM "Patient"
UNION ALL SELECT 'Presence customContentDetails', count("customContentDetails")::text FROM "Patient"
UNION ALL SELECT 'Presence goal', count("goal")::text FROM "Patient"
UNION ALL SELECT 'Presence exitDate', count("exitDate")::text FROM "Patient"
UNION ALL SELECT 'Presence stopReason', count("stopReason")::text FROM "Patient"
UNION ALL SELECT 'Presence etpFinalOutcome', count("etpFinalOutcome")::text FROM "Patient"
UNION ALL SELECT 'Presence referringCaregiver', count("referringCaregiver")::text FROM "Patient"
UNION ALL SELECT 'Presence followUpToDo', count("followUpToDo")::text FROM "Patient"
UNION ALL SELECT 'Presence notes', count("notes")::text FROM "Patient"
UNION ALL SELECT 'Presence details', count("details")::text FROM "Patient"

-- Somme de controle : contenu ordonne par patient, colonne par colonne.
UNION ALL SELECT 'Empreinte medicalDiagnosis',
  coalesce(md5(string_agg(coalesce("medicalDiagnosis", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte entryDate',
  coalesce(md5(string_agg(coalesce("entryDate"::text, '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte careMode',
  coalesce(md5(string_agg(coalesce("careMode", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte orientation',
  coalesce(md5(string_agg(coalesce("orientation", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpDecision',
  coalesce(md5(string_agg(coalesce("etpDecision", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte programType',
  coalesce(md5(string_agg(coalesce("programType", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte nonInclusionDetails',
  coalesce(md5(string_agg(coalesce("nonInclusionDetails", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte customContentDetails',
  coalesce(md5(string_agg(coalesce("customContentDetails", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte goal',
  coalesce(md5(string_agg(coalesce("goal", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte exitDate',
  coalesce(md5(string_agg(coalesce("exitDate"::text, '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte stopReason',
  coalesce(md5(string_agg(coalesce("stopReason", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpFinalOutcome',
  coalesce(md5(string_agg(coalesce("etpFinalOutcome", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte referringCaregiver',
  coalesce(md5(string_agg(coalesce("referringCaregiver", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte followUpToDo',
  coalesce(md5(string_agg(coalesce("followUpToDo", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte notes',
  coalesce(md5(string_agg(coalesce("notes", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte details',
  coalesce(md5(string_agg(coalesce("details", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
;
