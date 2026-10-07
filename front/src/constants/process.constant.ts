export const AUTH = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  ME: 'getMe',
}

// Écrans du super-admin : hors de tout tenant, donc
// aucune clé ici n'a besoin — ni ne doit — porter un établissement ou un
// service (front/CLAUDE.md, § « Query keys deliberately do not carry the
// tenant »). `GET_ESTABLISHMENT` prend malgré tout l'identifiant en clé
// (voir `useSuperAdminEstablishmentQuery`) : ce n'est pas un tenant mais la
// DONNÉE demandée, exactement comme `PATIENT.GET_BY_ID` la prend pour un
// patient.
export const SUPER_ADMIN = {
  GET_ALL_ESTABLISHMENTS: 'get_all_super_admin_establishments',
  GET_ESTABLISHMENT: 'get_super_admin_establishment',
  CREATE_ESTABLISHMENT: 'create_super_admin_establishment',
  RENAME_ESTABLISHMENT: 'rename_super_admin_establishment',
  SEARCH_ACCOUNT: 'search_super_admin_account',
  REISSUE_ACCESS_LINK: 'reissue_super_admin_access_link',
  CREATE_GRANT: 'create_super_admin_grant',
  REVOKE_GRANT: 'revoke_super_admin_grant',
  // Les deux journaux à l'échelle de la plateforme (`GET
  // /super-admin/access-log`) — une seule clé, la requête entière (filtres compris) figurant en
  // second élément du tableau `queryKey` (voir `useSuperAdminAccessLogQuery`), comme
  // `PATIENT_ACCESS_LOG.GET_BY_PATIENT` le fait déjà de `patientID`.
  GET_ACCESS_LOG: 'get_super_admin_access_log',
  // Journal d'activité d'UN établissement, paginé (2026-10-01) : extrait de
  // `GET_ESTABLISHMENT`, dont la réponse le portait borné à 100 lignes.
  GET_ESTABLISHMENT_ACTIVITY_LOG: 'get_super_admin_establishment_activity_log',
}

// Membres du service courant et leur rattachement a un soignant (2026-09-29).
export const SERVICE_MEMBER = {
  GET_ALL: 'get_all_service_members',
  SET_SOIGNANT: 'set_service_member_soignant',
  INVITE: 'invite_service_member',
  SET_ROLE: 'set_service_member_role',
  REMOVE: 'remove_service_member',
}

export const TODO = {
  GET_ALL: 'get_all_todos',
  GET: 'get_todo',
  CREATE: 'create_todo',
  UPDATE: 'update_todo',
  DELETE: 'delete_todo',
}

export const SOIGNANT = {
  GET_ALL: 'get_all_soignants',
  GET_ALL_OF_SERVICE: 'get_all_soignants_of_service',
  GET: 'get_soignant',
  CREATE: 'create_soignant',
  UPDATE: 'update_soignant',
  DELETE: 'delete_soignant',
}

export const PATIENT = {
  GET_ALL: 'get_all_patients',
  GET_ALL_WITH_TAGS: 'get_all_patients_with_tags',
  GET_BY_ID: 'get_by_id_patient',
  GET: 'get_patient',
  SEARCH_IDENTITY: 'search_patient_identity',
  CREATE: 'create_patient',
  ENROLL: 'enroll_patient',
  ENROLL_EXISTING: 'enroll_existing_patient',
  UPDATE: 'update_patient',
  DELETE: 'delete_patient',
  DISMISS_ENROLLMENT_ISSUE: 'dismiss_enrollment_issue',
  REMOVE_FROM_PATHWAY: 'remove_patient_from_pathway',
  GET_PATHWAYS: 'get_patient_pathways',
  REORDER_PATHWAYS: 'reorder_patient_pathways',
}

// Sous-dossier de service du patient : clé volontairement sans le
// tenant (établissement/service), comme le reste des clés de ce fichier — voir `front/CLAUDE.md`
// § « Query keys deliberately do not carry the tenant ».
export const PATIENT_SERVICE_FILE = {
  GET_BY_PATIENT: 'get_patient_service_file',
  UPDATE: 'update_patient_service_file',
  // Rattachement d'une identité existante (trouvée par PATIENT.SEARCH_IDENTITY) au service
  // courant.
  ATTACH_EXISTING: 'attach_existing_patient_service_file',
}

export const SLOT = {
  GET_ALL: 'get_all_slots',
  GET_BY_ID: 'get_by_id_slot',
  GET: 'get_slot',
  CREATE: 'create_slot',
  UPDATE: 'update_slot',
  DELETE: 'delete_slot',
}

export const SLOT_TEMPLATE = {
  GET_ALL: 'get_all_slot_templates',
  GET_BY_ID: 'get_by_id_slot_template',
  GET: 'get_slot_template',
  CREATE: 'create_slot_template',
  UPDATE: 'update_slot_template',
  DELETE: 'delete_slot_template',
}

export const PATHWAY = {
  GET_ALL: 'get_all_pathways',
  GET_BY_ID: 'get_by_id_pathway',
  GET: 'get_pathway',
  CREATE: 'create_pathway',
  INSTANTIATE: 'instantiate_pathway',
  REGENERATE: 'regenerate_pathways',
  UPDATE: 'update_pathway',
  DELETE: 'delete_pathway',
  GET_TRACKING: 'get_tracking_pathway',
}

export const PATHWAY_TEMPLATE = {
  GET_ALL: 'get_all_pathway_templates',
  GET_BY_ID: 'get_by_id_pathway_template',
  GET: 'get_pathway_template',
  CREATE: 'create_pathway_template',
  UPDATE: 'update_pathway_template',
  DELETE: 'delete_pathway_template',
  REORDER: 'reorder_pathway_templates',
}

export const THEMATIC = {
  GET_ALL: 'get_all_thematics',
  CREATE: 'create_thematic',
  UPDATE: 'update_thematic',
  DELETE: 'delete_thematic',
}

export const MEMBER = {
  GET_ALL: 'get_all_members',
  UPDATE: 'update_member',
  REMOVE: 'remove_member',
  DEACTIVATE: 'deactivate_member',
  RESEND_INVITATION: 'resend_member_invitation',
  // Création de compte, distincte de `ADD` (rattachement
  // d'un compte existant).
  CREATE_ACCOUNT: 'create_member_account',
}

// Onglet des services de l'administration d'établissement.
// `DEACTIVATION_IMPACT` n'est JAMAIS appelée pour toute la liste
// (arbitrage transmis par Léo) : seulement à la demande,
// au moment de désactiver un service précis.
export const SERVICE_ADMIN = {
  GET_ALL: 'get_all_services_admin',
  CREATE: 'create_service_admin',
  UPDATE: 'update_service_admin',
  DEACTIVATION_IMPACT: 'service_admin_deactivation_impact',
  RENAME_ESTABLISHMENT: 'rename_establishment_admin',
}

// Onglet des accès temporaires de l'administration d'établissement :
// `GET /e/:establishmentId/admin/grants`, en cours ET passés.
export const GRANT_ESTABLISHMENT = {
  GET_ALL: 'get_all_establishment_grants',
}

export const LOCATION = {
  GET_ALL: 'get_all_locations',
  CREATE: 'create_location',
  UPDATE: 'update_location',
  DELETE: 'delete_location',
}

export const APPOINTMENT = {
  GET_ALL: 'get_all_appointments',
  GET_BY_ID: 'get_by_id_appointment',
  CREATE: 'create_appointment',
  UPDATE: 'update_appointment',
  DELETE: 'delete_appointment',
}

export const DIAGNOSTIC_EDUCATIF = {
  GET_BY_PATIENT: 'get_diagnostics_by_patient',
  GET_BY_ID: 'get_diagnostic_by_id',
  CREATE: 'create_diagnostic',
  UPDATE: 'update_diagnostic',
  DELETE: 'delete_diagnostic',
}

export const DIAGNOSTIC_EDUCATIF_TEMPLATE = {
  GET_ALL: 'get_all_diagnostic_templates',
  GET_BY_ID: 'get_diagnostic_template_by_id',
  CREATE: 'create_diagnostic_template',
  UPDATE: 'update_diagnostic_template',
  DELETE: 'delete_diagnostic_template',
}

export const ACTIVITY_LOG = {
  GET_ALL: 'get_all_activity_logs',
  CLEANUP: 'cleanup_activity_logs',
}

// Journal des consultations d'un dossier patient. Clé sans le tenant, comme
// le reste de ce fichier (`front/CLAUDE.md` § « Query keys deliberately do not carry the
// tenant ») ; elle porte `patientID`, exactement comme `PATIENT_SERVICE_FILE.GET_BY_PATIENT` porte
// l'identifiant de la ressource demandée, pas celui d'un tenant.
export const PATIENT_ACCESS_LOG = {
  GET_BY_PATIENT: 'get_patient_access_log',
}

export const FORBIDDEN_WEEK = {
  GET_ALL: 'get_all_forbidden_weeks',
  CREATE: 'create_forbidden_week',
  DELETE: 'delete_forbidden_week',
}

export const PLANNING_CYCLE = {
  GET: 'get_planning_cycle',
  SAVE: 'save_planning_cycle',
  RESET: 'reset_planning_cycle',
}

export const ARS_INDICATOR = {
  GET: 'get_ars_indicators',
}

export const ACTIVITY = {
  GET: 'get_activity',
}
