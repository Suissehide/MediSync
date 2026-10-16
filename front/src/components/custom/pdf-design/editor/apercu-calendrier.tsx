import { Lock } from 'lucide-react'

import { A4_HEIGHT, A4_WIDTH } from '../../../../types/pdfDesign.ts'

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

// Les rendez-vous du schema : [jour, depart en quarts d'heure, duree]. Rien de reel, juste de
// quoi montrer la FORME de la grille — une semaine, cinq colonnes, des creneaux poses dessus.
const CRENEAUX: { jour: number; haut: number; hauteur: number }[] = [
  { jour: 0, haut: 0, hauteur: 34 },
  { jour: 3, haut: 12, hauteur: 34 },
  { jour: 1, haut: 56, hauteur: 48 },
  { jour: 4, haut: 70, hauteur: 34 },
]

// La page calendrier ne se compose pas : elle est produite a l'export depuis les rendez-vous du
// patient. On en montre donc la FORME — la grille hebdomadaire que `calendar-pages.pdf.tsx`
// dessine — et non un faux planning : des horaires inventes mentiraient sur ce que le PDF
// contiendra, et la pastille du bas dit d'ou viendra le vrai contenu.
export default function ApercuCalendrier({ echelle }: { echelle: number }) {
  const px = (valeur: number) => valeur * echelle

  return (
    <div
      data-testid="apercu-calendrier"
      className="relative bg-white shadow-[0_4px_18px_rgba(4,24,43,.12)] overflow-hidden"
      style={{ width: px(A4_WIDTH), height: px(A4_HEIGHT) }}
    >
      <div
        className="flex flex-col"
        style={{ padding: px(28), gap: px(14), fontSize: px(8) }}
      >
        {[0, 1].map((semaine) => (
          <div key={semaine} className="flex flex-col">
            <div className="flex" style={{ height: px(16) }}>
              <div
                className="flex items-center justify-center bg-muted text-text-dark font-semibold"
                style={{ width: px(52), fontSize: px(7) }}
              >
                Semaine {semaine + 1}
              </div>
              {JOURS.map((jour) => (
                <div
                  key={jour}
                  className="flex-1 flex items-center justify-center border-l border-border text-text-light"
                  style={{ fontSize: px(6) }}
                >
                  {jour}
                </div>
              ))}
            </div>
            <div className="flex border-t border-border">
              <div
                className="border-r border-border"
                style={{ width: px(52), height: px(120) }}
              />
              <div className="flex-1 relative" style={{ height: px(120) }}>
                {CRENEAUX.map((creneau) => (
                  <div
                    key={`${creneau.jour}-${creneau.haut}`}
                    className="absolute bg-secondary-light border border-secondary/40 rounded-xs"
                    style={{
                      left: `${creneau.jour * 20 + 2}%`,
                      width: '16%',
                      top: px(creneau.haut),
                      height: px(creneau.hauteur),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 h-[30px] px-3 rounded-full bg-foreground text-background text-xs flex items-center gap-1.5 whitespace-nowrap"
        style={{ bottom: px(30) }}
      >
        <Lock className="w-3 h-3" />
        Générée à l'export depuis les rendez-vous du patient
      </div>
    </div>
  )
}
