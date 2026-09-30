import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { AttachExistingPatientResult } from '../types/patient.ts'
import type {
  PatientServiceFile,
  UpdatePatientServiceFileParams,
} from '../types/patientServiceFile.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// URL composée par `tenantApiUrl()`, comme les quatorze autres modules de ce dossier : le
// contexte établissement/service est implicite, lu dans le store au moment de l'appel — pas un
// argument de cette fonction (convention du dépôt, `front/CLAUDE.md` § « Le contexte est
// implicite »).
export const PatientServiceFileApi = {
  // Rend une 404 tant qu'aucune écriture n'a encore créé le sous-dossier pour ce patient dans
  // ce service — délibéré côté back (un objet vide et une absence ne se distingueraient pas
  // côté appelant). Cette fonction laisse cette 404 remonter comme n'importe quelle autre
  // erreur HTTP ; c'est au hook appelant (`usePatientServiceFileQuery`) de la traduire en
  // absence normale plutôt qu'en erreur à afficher.
  getByPatient: async (patientID: string): Promise<PatientServiceFile> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/patient/${patientID}/service-file`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le dossier du patient pour ce service',
      )
    }
    return response.json()
  },

  // Rattache une identité existante (trouvée par `PatientApi.searchIdentity`) au service
  // courant : crée le sous-dossier s'il n'existe pas déjà, sans jamais toucher à l'identité
  // partagée ni au sous-dossier d'un autre service (spec §6). Aucun corps : cette
  // route ne fait que dire "ce patient est désormais suivi ici", jamais écrire un contenu.
  // `alreadyFollowedHere` distingue les deux cas pour que l'écran le dise clairement, sans
  // écraser un sous-dossier déjà présent.
  attachExisting: async (
    patientID: string,
  ): Promise<AttachExistingPatientResult> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/patient/${patientID}/service-file`,
      { method: 'POST' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de rattacher ce patient au service courant',
      )
    }
    return response.json()
  },

  // PATCH, jamais PUT : une charge partielle fait une mise à jour partielle. La route back le
  // justifie (voir `patientServiceFile.ts`, back) — un remplacement complet effacerait les
  // champs cliniques qu'un compte secrétariat ne voit pas dans sa propre lecture, donc ne peut
  // pas réenvoyer. Cette fonction ne doit donc jamais recevoir un objet reconstruit à partir
  // d'une lecture filtrée : seuls les champs effectivement modifiés.
  update: async (
    params: UpdatePatientServiceFileParams,
  ): Promise<PatientServiceFile> => {
    const { patientID, ...body } = params
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/patient/${patientID}/service-file`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de modifier le dossier du patient pour ce service',
      )
    }
    return response.json()
  },
}
