-- À jouer AVANT la migration multi_tenant_socle. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à la sortie de multi-tenant-socle.sql jouée APRÈS la migration :
-- toute valeur différente entre les deux signale une perte ou une déformation de données.

-- Une ligne par table qui reçoit des colonnes de tenant dans la migration : les 17 tables
-- contraintes NOT NULL au temps 3 (identiques à la garde de neutralité du temps 2), plus
-- ActivityLog, dont les colonnes de tenant restent nullables mais qui est remplie comme
-- les autres. Un simple compte de lignes : ces tables ne sont ni renommées ni vidées par
-- la migration, la requête est donc rejouable à l'identique après coup.
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
UNION ALL SELECT 'Lignes ActivityLog', count(*) FROM "ActivityLog"

-- Utilisateurs par ancien rôle : la colonne role disparaît pendant la migration ; ces
-- mesures portent les mêmes libellés que leurs contreparties, déjà présentes dans
-- multi-tenant-socle.sql, qui les recalculent après coup à partir des appartenances créées.
UNION ALL SELECT 'Appartenances etab (attendu = anciens ADMIN+USER)', count(*) FROM "User" WHERE "role" IN ('ADMIN', 'USER')
UNION ALL SELECT 'Appartenances service (attendu = anciens ADMIN+USER)', count(*) FROM "User" WHERE "role" IN ('ADMIN', 'USER')
UNION ALL SELECT 'Coordinateurs (attendu = anciens ADMIN)', count(*) FROM "User" WHERE "role" = 'ADMIN'

-- Tables de liaison implicites : deviendront SlotTemplateSoignant / SoignantThematic.
-- Mêmes libellés que leurs contreparties explicites, déjà présentes dans
-- multi-tenant-socle.sql.
UNION ALL SELECT 'Liens slotTemplate-soignant', count(*) FROM "_SlotTemplateSoignants"
UNION ALL SELECT 'Liens soignant-thematic', count(*) FROM "_SoignantThematics";
