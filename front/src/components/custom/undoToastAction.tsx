import { Button } from '../ui/button.tsx'

// Le bouton « Annuler » des toasts d'archivage. Il vit ici pour que les hooks
// de requete restent en `.ts` : c'est le seul JSX dont ils auraient besoin.
export const undoToastAction = (onUndo: () => void) => (
  <Button
    variant="none"
    size="sm"
    className="h-7 px-2 text-xs"
    onClick={onUndo}
  >
    Annuler
  </Button>
)
