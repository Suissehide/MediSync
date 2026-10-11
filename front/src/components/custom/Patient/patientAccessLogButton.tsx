import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'

import { useCan } from '../../../hooks/useCan.ts'
import { POPOVER_MENU_ITEM_CLASS } from '../../ui/popover.tsx'

type PatientAccessLogButtonProps = {
  establishmentId: string
  serviceId: string
  patientID: string
}

// Entrée « Consultations du dossier » du menu « … » de la fiche patient, vers
// `patient/$patientID/acces.tsx` — réservée à `consultations:read` (rôle COORDINATEUR uniquement,
// `utils/permissions.ts`), la même garde que la route elle-même : un lien vers un écran
// inaccessible serait pire qu'une absence de lien.
//
// Reste un VRAI lien (`role="link"`, avec `href`), seulement habillé en entrée de menu depuis le
// handoff « fiche patient, aperçu général » qui l'a sortie de l'en-tête : ouvrable dans un nouvel
// onglet, et le menu du composant parent décide seul de son affichage.
//
// Extrait de `patient/$patientID/index.tsx` en composant à part, pour être éprouvé isolément —
// monter l'écran entier (`PatientDetails`) exigerait aussi `OverviewPatient`, `AddPatientForm` et
// leurs requêtes propres, sans rapport avec ce que ce lien doit garantir : sa visibilité
// conditionnelle et les paramètres de son lien. Voir `patientAccessLogButton.test.tsx`.
export const PatientAccessLogButton = ({
  establishmentId,
  serviceId,
  patientID,
}: PatientAccessLogButtonProps) => {
  const canReadAccessLog = useCan('consultations:read')

  if (!canReadAccessLog) {
    return null
  }

  return (
    <Link
      to="/e/$establishmentId/s/$serviceId/patient/$patientID/acces"
      params={{ establishmentId, serviceId, patientID }}
      className={POPOVER_MENU_ITEM_CLASS}
    >
      <History className="w-4 h-4 opacity-70" />
      Consultations du dossier
    </Link>
  )
}
