import { useState } from 'react'

import { Barres, Carte } from '@/components/custom/pilotage/carte.tsx'
import type { ActivityReport } from '@/types/activity.ts'

const VISIBLES = 6

// Réglé par le service (champ et valeur « fin de parcours ») : rendu seulement si r.completion existe (activite.tsx).
type Completion = NonNullable<ActivityReport['completion']>

export function Motifs({ completion }: { completion: Completion }) {
  const [tous, setTous] = useState(false)
  const motifs = completion.dropoutReasons
  return (
    <Carte className="gap-3">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="text-base font-semibold text-foreground">
          Motifs d'arrêt
        </h2>
        <span className="text-[13px] text-text-light">
          {completion.dropouts}{' '}
          {completion.dropouts > 1 ? 'abandons' : 'abandon'}
        </span>
      </div>
      <Barres
        couleur="bg-abandon"
        gras
        lignes={(tous ? motifs : motifs.slice(0, VISIBLES)).map((m) => ({
          libelle: m.label,
          valeur: m.count,
          texte: String(m.count),
        }))}
        vide="Aucun abandon sur la période."
      />
      {motifs.length > VISIBLES && (
        <button
          type="button"
          aria-expanded={tous}
          onClick={() => setTous((t) => !t)}
          className="self-start text-[13px] font-semibold text-primary cursor-pointer"
        >
          {tous ? 'Afficher moins' : `Voir les ${motifs.length} motifs`}
        </button>
      )}
    </Carte>
  )
}
