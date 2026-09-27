import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'

import { useCan } from '../../../hooks/useCan.ts'
import { Button } from '../../ui/button.tsx'

type PatientAccessLogButtonProps = {
  establishmentId: string
  serviceId: string
  patientID: string
}

// Étape 4b, tâche 10 : bouton « Journal des accès » de la fiche patient, vers
// `patient/$patientID/acces.tsx` — réservé à `consultations:read` (rôle COORDINATEUR uniquement,
// `utils/permissions.ts`), la même garde que la route elle-même : un lien vers un écran
// inaccessible serait pire qu'une absence de lien.
//
// Étape 4b, tâche 11 (brief, « un petit reste de la tâche 10 ») : extrait de
// `patient/$patientID/index.tsx` en composant à part, pour être éprouvé isolément — monter
// l'écran entier (`PatientDetails`) exigerait aussi `OverviewPatient`, `AddPatientForm` et leurs
// requêtes propres, sans rapport avec ce que ce bouton doit garantir : sa visibilité
// conditionnelle et les paramètres de son lien. Voir `patientAccessLogButton.test.tsx`, le test
// qui manquait.
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
    <Button
      asChild
      variant="outline"
      size="default"
      className="font-normal leading-tight"
    >
      <Link
        to="/e/$establishmentId/s/$serviceId/patient/$patientID/acces"
        params={{ establishmentId, serviceId, patientID }}
      >
        <History className="w-4 h-4" />
        Journal des accès
      </Link>
    </Button>
  )
}
