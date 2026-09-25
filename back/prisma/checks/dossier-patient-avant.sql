-- À jouer AVANT la migration patient_service_file. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à celle de dossier-patient.sql jouée APRÈS : toute valeur
-- différente signale une perte, une recopie vide ou un décalage.
--
-- Les comptages seuls ne suffisent PAS ici : les lignes ne se déplacent pas, ce sont les
-- valeurs qui changent de table. Une recopie décalée d'une ligne garderait des comptages
-- identiques. D'où la somme de contrôle sur le contenu ordonné, qui, elle, la détecte.
--
-- Sentinelle E'\x01' et séparateur E'\x02' : ne pas les remplacer par '~' et '|', qui
-- restent des caractères qu'une saisie clinique peut contenir. Avec un caractère imprimable,
-- une valeur NULL et la valeur littérale '~' produiraient la même empreinte, et
-- string_agg('a|b','c') collisionnerait avec string_agg('a','b|c') : deux pertes de données
-- invisibles à cette mesure. Un octet de contrôle ne peut pas être saisi par un humain ni
-- provenir d'un champ texte applicatif, ce n'est donc plus une propriété des données du jour
-- mais une garantie du code, valable même si la prochaine note contient un jour '~' ou '|'.
-- Identique dans dossier-patient.sql : une différence de sentinelle ou de séparateur entre
-- les deux fichiers ferait diverger toutes les empreintes, y compris sur une migration saine.

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
  coalesce(md5(string_agg(coalesce("medicalDiagnosis", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte entryDate',
  coalesce(md5(string_agg(coalesce("entryDate"::text, E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte careMode',
  coalesce(md5(string_agg(coalesce("careMode", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte orientation',
  coalesce(md5(string_agg(coalesce("orientation", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpDecision',
  coalesce(md5(string_agg(coalesce("etpDecision", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte programType',
  coalesce(md5(string_agg(coalesce("programType", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte nonInclusionDetails',
  coalesce(md5(string_agg(coalesce("nonInclusionDetails", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte customContentDetails',
  coalesce(md5(string_agg(coalesce("customContentDetails", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte goal',
  coalesce(md5(string_agg(coalesce("goal", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte exitDate',
  coalesce(md5(string_agg(coalesce("exitDate"::text, E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte stopReason',
  coalesce(md5(string_agg(coalesce("stopReason", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpFinalOutcome',
  coalesce(md5(string_agg(coalesce("etpFinalOutcome", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte referringCaregiver',
  coalesce(md5(string_agg(coalesce("referringCaregiver", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte followUpToDo',
  coalesce(md5(string_agg(coalesce("followUpToDo", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte notes',
  coalesce(md5(string_agg(coalesce("notes", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte details',
  coalesce(md5(string_agg(coalesce("details", E'\x01'), E'\x02' ORDER BY id)), 'vide') FROM "Patient"
;
