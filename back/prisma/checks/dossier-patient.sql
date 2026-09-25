-- À jouer APRÈS la migration patient_service_file. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à celle de dossier-patient-avant.sql jouée AVANT : toute valeur
-- différente signale une perte, une recopie vide ou un décalage.
--
-- Les comptages seuls ne suffisent PAS ici : les lignes ne se déplacent pas, ce sont les
-- valeurs qui changent de table. Une recopie décalée d'une ligne garderait des comptages
-- identiques. D'où la somme de contrôle sur le contenu ordonné, qui, elle, la détecte.
-- Le `coalesce(..., E'\x01')` compte : sans lui, une valeur nulle disparaîtrait de l'agrégat
-- et un décalage passerait inaperçu. L'ordre par patientId est le même qu'AVANT, où
-- l'ordre se faisait par l'id du patient (identique à patientId).
--
-- Sentinelle E'\x01' et séparateur E'\x02' : ne pas les remplacer par '~' et '|', qui
-- restent des caractères qu'une saisie clinique peut contenir. Avec un caractère imprimable,
-- une valeur NULL et la valeur littérale '~' produiraient la même empreinte, et
-- string_agg('a|b','c') collisionnerait avec string_agg('a','b|c') : deux pertes de données
-- invisibles à cette mesure. Un octet de contrôle ne peut pas être saisi par un humain ni
-- provenir d'un champ texte applicatif, ce n'est donc plus une propriété des données du jour
-- mais une garantie du code, valable même si la prochaine note contient un jour '~' ou '|'.
-- Identique dans dossier-patient-avant.sql : une différence de sentinelle ou de séparateur
-- entre les deux fichiers ferait diverger toutes les empreintes, y compris sur une migration
-- saine.

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
  coalesce(md5(string_agg(coalesce(f."medicalDiagnosis", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte entryDate',
  coalesce(md5(string_agg(coalesce(f."entryDate"::text, E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte careMode',
  coalesce(md5(string_agg(coalesce(f."careMode", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte orientation',
  coalesce(md5(string_agg(coalesce(f."orientation", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte etpDecision',
  coalesce(md5(string_agg(coalesce(f."etpDecision", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte programType',
  coalesce(md5(string_agg(coalesce(f."programType", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte nonInclusionDetails',
  coalesce(md5(string_agg(coalesce(f."nonInclusionDetails", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte customContentDetails',
  coalesce(md5(string_agg(coalesce(f."customContentDetails", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte goal',
  coalesce(md5(string_agg(coalesce(f."goal", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte exitDate',
  coalesce(md5(string_agg(coalesce(f."exitDate"::text, E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte stopReason',
  coalesce(md5(string_agg(coalesce(f."stopReason", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte etpFinalOutcome',
  coalesce(md5(string_agg(coalesce(f."etpFinalOutcome", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte referringCaregiver',
  coalesce(md5(string_agg(coalesce(f."referringCaregiver", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte followUpToDo',
  coalesce(md5(string_agg(coalesce(f."followUpToDo", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte notes',
  coalesce(md5(string_agg(coalesce(f."notes", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
UNION ALL SELECT 'Empreinte details',
  coalesce(md5(string_agg(coalesce(f."details", E'\x01'), E'\x02' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f

-- Invariants de structure : n'ont de sens qu'apres la migration, absents du fichier « avant ».
-- 'Sous-dossiers' rend la mesure bilaterale : 'Patients sans sous-dossier' = 0 dit que
-- personne n'en manque, mais un sous-dossier surnumeraire (un patient qui en recoit deux,
-- un autre qui n'en aurait aucun caché derriere l'agrégat) laisse les autres invariants a
-- zero. Comparé au libellé 'Patients' plus haut dans ce même fichier : égal, aucun manque
-- ET aucun surplus ; supérieur, un ou plusieurs sous-dossiers en trop.
UNION ALL SELECT 'Sous-dossiers', count(*)::text FROM "PatientServiceFile"
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
