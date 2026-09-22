-- À jouer APRÈS la migration multi_tenant_socle. Deux requêtes :
-- 1) les invariants (tout doit valoir 0 sauf indication) ;
-- 2) les mêmes mesures que multi-tenant-socle-avant.sql, mêmes libellés, à comparer
--    valeur par valeur avec sa sortie : le moindre écart signale une perte de données.
SELECT 'Patient sans etablissement' AS check, count(*) FROM "Patient" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Soignant sans etablissement', count(*) FROM "Soignant" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Location sans etablissement', count(*) FROM "Location" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Slot sans service', count(*) FROM "Slot" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Appointment sans service', count(*) FROM "Appointment" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Thematic sans service', count(*) FROM "Thematic" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Etablissements (attendu 1)', count(*) FROM "Establishment"
UNION ALL SELECT 'Services (attendu 1)', count(*) FROM "Service"
UNION ALL SELECT 'PlanningCycle (attendu 0 ou 1)', count(*) FROM "PlanningCycle"
UNION ALL SELECT 'Appartenances etab (attendu = anciens ADMIN+USER)', count(*) FROM "EstablishmentMembership"
UNION ALL SELECT 'Appartenances service (attendu = anciens ADMIN+USER)', count(*) FROM "ServiceMembership"
UNION ALL SELECT 'Coordinateurs (attendu = anciens ADMIN)', count(*) FROM "ServiceMembership" WHERE "role" = 'COORDINATEUR'
UNION ALL SELECT 'Liens slotTemplate-soignant', count(*) FROM "SlotTemplateSoignant"
UNION ALL SELECT 'Liens soignant-thematic', count(*) FROM "SoignantThematic";

-- Comptes de lignes par table migrée, à comparer un par un avec multi-tenant-socle-avant.sql
-- (mêmes tables, mêmes libellés, même requête : aucune de ces tables n'est renommée ni vidée
-- par la migration).
SELECT 'Lignes Appointment' AS check, count(*) FROM "Appointment"
UNION ALL SELECT 'Lignes AppointmentPatient', count(*) FROM "AppointmentPatient"
UNION ALL SELECT 'Lignes DiagnosticEducatif', count(*) FROM "DiagnosticEducatif"
UNION ALL SELECT 'Lignes DiagnosticEducatifTemplate', count(*) FROM "DiagnosticEducatifTemplate"
UNION ALL SELECT 'Lignes EnrollmentIssue', count(*) FROM "EnrollmentIssue"
UNION ALL SELECT 'Lignes ForbiddenWeek', count(*) FROM "ForbiddenWeek"
UNION ALL SELECT 'Lignes Location', count(*) FROM "Location"
UNION ALL SELECT 'Lignes Pathway', count(*) FROM "Pathway"
UNION ALL SELECT 'Lignes PathwayTemplate', count(*) FROM "PathwayTemplate"
UNION ALL SELECT 'Lignes Patient', count(*) FROM "Patient"
UNION ALL SELECT 'Lignes PatientPathwayPriority', count(*) FROM "PatientPathwayPriority"
UNION ALL SELECT 'Lignes PlanningCycle', count(*) FROM "PlanningCycle"
UNION ALL SELECT 'Lignes Slot', count(*) FROM "Slot"
UNION ALL SELECT 'Lignes SlotTemplate', count(*) FROM "SlotTemplate"
UNION ALL SELECT 'Lignes Soignant', count(*) FROM "Soignant"
UNION ALL SELECT 'Lignes Thematic', count(*) FROM "Thematic"
UNION ALL SELECT 'Lignes Todo', count(*) FROM "Todo"
UNION ALL SELECT 'Lignes ActivityLog', count(*) FROM "ActivityLog";
