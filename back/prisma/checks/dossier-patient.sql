-- À jouer APRÈS la migration patient_service_file. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à celle de dossier-patient-avant.sql jouée AVANT : toute valeur
-- différente signale une perte, une recopie vide ou un décalage.
--
-- Les comptages seuls ne suffisent PAS ici : les lignes ne se déplacent pas, ce sont les
-- valeurs qui changent de table. Une recopie décalée d'une ligne garderait des comptages
-- identiques. D'où la somme de contrôle sur le contenu ordonné, qui, elle, la détecte.
-- Le `coalesce(..., '~')` compte : sans lui, une valeur nulle disparaîtrait de l'agrégat
-- et un décalage passerait inaperçu. L'ordre par patientId est le même qu'AVANT, où
-- l'ordre se faisait par l'id du patient (identique à patientId).

SELECT 'Patients' AS check, count(*)::text AS value FROM "Patient"
UNION ALL SELECT 'Etablissements', count(*)::text FROM "Establishment"
UNION ALL SELECT 'Services', count(*)::text FROM "Service"

-- Presence : une ligne par colonne qui a demenage, mesuree sur PatientServiceFile.
UNION ALL SELECT 'Presence medicalDiagnosis', count("medicalDiagnosis")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence entryDate', count("entryDate")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence careMode', count("careMode")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence orientation', count("orientation")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence etpDecision', count("etpDecision")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence programType', count("programType")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence nonInclusionDetails', count("nonInclusionDetails")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence customContentDetails', count("customContentDetails")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence goal', count("goal")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence exitDate', count("exitDate")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence stopReason', count("stopReason")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence etpFinalOutcome', count("etpFinalOutcome")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence referringCaregiver', count("referringCaregiver")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence followUpToDo', count("followUpToDo")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence notes', count("notes")::text FROM "PatientServiceFile"
UNION ALL SELECT 'Presence details', count("details")::text FROM "PatientServiceFile"

-- Somme de controle : contenu ordonne par patient, colonne par colonne, sur PatientServiceFile.
UNION ALL SELECT 'Empreinte medicalDiagnosis',
  coalesce(md5(string_agg(coalesce(f."medicalDiagnosis", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte entryDate',
  coalesce(md5(string_agg(coalesce(f."entryDate"::text, '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte careMode',
  coalesce(md5(string_agg(coalesce(f."careMode", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte orientation',
  coalesce(md5(string_agg(coalesce(f."orientation", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte etpDecision',
  coalesce(md5(string_agg(coalesce(f."etpDecision", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte programType',
  coalesce(md5(string_agg(coalesce(f."programType", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte nonInclusionDetails',
  coalesce(md5(string_agg(coalesce(f."nonInclusionDetails", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte customContentDetails',
  coalesce(md5(string_agg(coalesce(f."customContentDetails", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte goal',
  coalesce(md5(string_agg(coalesce(f."goal", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte exitDate',
  coalesce(md5(string_agg(coalesce(f."exitDate"::text, '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte stopReason',
  coalesce(md5(string_agg(coalesce(f."stopReason", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte etpFinalOutcome',
  coalesce(md5(string_agg(coalesce(f."etpFinalOutcome", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte referringCaregiver',
  coalesce(md5(string_agg(coalesce(f."referringCaregiver", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte followUpToDo',
  coalesce(md5(string_agg(coalesce(f."followUpToDo", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte notes',
  coalesce(md5(string_agg(coalesce(f."notes", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte details',
  coalesce(md5(string_agg(coalesce(f."details", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f

-- Invariants de structure : n'ont de sens qu'apres la migration, absents du fichier « avant ».
UNION ALL SELECT 'Sous-dossiers sans patient', count(*)::text FROM "PatientServiceFile" f
  WHERE NOT EXISTS (SELECT 1 FROM "Patient" p WHERE p.id = f."patientId")
UNION ALL SELECT 'Sous-dossiers hors etablissement du service', count(*)::text
  FROM "PatientServiceFile" f JOIN "Service" s ON s.id = f."serviceId"
  WHERE s."establishmentId" <> f."establishmentId"
UNION ALL SELECT 'Patients sans sous-dossier', count(*)::text FROM "Patient" p
  WHERE NOT EXISTS (SELECT 1 FROM "PatientServiceFile" f WHERE f."patientId" = p.id)
UNION ALL SELECT 'Diagnostics orphelins', count(*)::text FROM "DiagnosticEducatif" d
  WHERE NOT EXISTS (SELECT 1 FROM "PatientServiceFile" f
                    WHERE f."patientId" = d."patientId" AND f."serviceId" = d."serviceId")
UNION ALL SELECT 'Inscriptions orphelines', count(*)::text FROM "EnrollmentIssue" e
  WHERE NOT EXISTS (SELECT 1 FROM "PatientServiceFile" f
                    WHERE f."patientId" = e."patientId" AND f."serviceId" = e."serviceId")
;
