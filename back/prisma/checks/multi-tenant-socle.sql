-- Invariants après la migration multi_tenant_socle. Tout doit valoir 0 sauf indication.
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
