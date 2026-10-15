import { Document, PDFViewer } from '@react-pdf/renderer'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Eye, PencilRuler, Redo2, Save, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import Inspecteur from '@/components/custom/pdf-design/editor/inspecteur.tsx'
import Palette from '@/components/custom/pdf-design/editor/palette.tsx'
import {
  type ActionClavier,
  actionDuClavier,
  CHAMPS_DE_SAISIE,
} from '@/components/custom/pdf-design/editor/raccourcis.ts'
import ToileEditable from '@/components/custom/pdf-design/editor/toile-editable.tsx'
import { useEdition } from '@/components/custom/pdf-design/editor/use-edition.ts'
import { useHistorique } from '@/components/custom/pdf-design/editor/use-historique.ts'
import {
  SAMPLE_FIELD_CONTEXT,
  SAMPLE_FIELD_VALUES,
} from '@/components/custom/pdf-design/fields.ts'
import { pagesOf } from '@/components/custom/pdf-design/render-pdf.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { can } from '@/hooks/useCan.ts'
import {
  usePdfDesignMutations,
  usePdfDesignQueries,
} from '@/queries/usePdfDesign.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfDesignContent,
} from '@/types/pdfDesign.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: PdfDesignEditor,
})

const CONTENU_VIDE: PdfDesignContent = { version: 1, pages: [] }

// Le calendrier d'apercu n'a ni patient ni creneau : l'editeur ne montre jamais un vrai
// dossier, et SAMPLE_FIELD_CONTEXT est son seul jeu de donnees.
const CALENDRIER_ECHANTILLON = {
  upcomingSlots: [],
  patientId: 'apercu',
  forbiddenWeekStarts: [],
  noticeByThematicId: new Map<string, string>(),
}

function PdfDesignEditor() {
  const navigate = useNavigate()
  const { establishmentId, serviceId, designId } = Route.useParams()
  const { designs, isPending } = usePdfDesignQueries()
  const { saveContent } = usePdfDesignMutations()
  const design = designs.find((d) => d.id === designId)

  const {
    contenu,
    pagesEditables,
    pageCourante,
    choisirPage,
    selection,
    choisirElement,
    modifierElement,
    ajouterElement,
    supprimerSelection,
    dupliquerSelection,
    changerOrdre,
    remplacerContenu,
    marquerEnregistre,
    modifie,
  } = useEdition(design?.content ?? CONTENU_VIDE)

  const { synchroniser, annuler, retablir, peutAnnuler, peutRetablir } =
    useHistorique(remplacerContenu)

  // L'historique se branche ici, sur le contenu lui-meme : il regroupe les rafales d'un
  // geste et ignore ce qu'il vient de restaurer.
  useEffect(() => {
    synchroniser(contenu)
  }, [contenu, synchroniser])

  const elementSelectionne =
    pageCourante?.elements.find((e) => e.id === selection) ?? null

  // La decision est dans `actionDuClavier`, pure et testee ; ici ne reste que l'execution.
  const appliquer = (action: ActionClavier) => {
    if (action.type === 'annuler') {
      annuler()
      return
    }
    if (action.type === 'retablir') {
      retablir()
      return
    }
    if (action.type === 'deselectionner') {
      choisirElement(null)
      return
    }
    if (!selection || !elementSelectionne) {
      return
    }
    if (action.type === 'supprimer') {
      supprimerSelection()
      return
    }
    modifierElement(selection, {
      x: elementSelectionne.x + action.dx,
      y: elementSelectionne.y + action.dy,
    })
  }

  // Sur la FENETRE, pas sur un conteneur : la toile fait `preventDefault` sur pointerdown
  // pour ne pas lancer de selection de texte, donc aucun conteneur ne recoit jamais le
  // focus et aucun raccourci ne partirait. L'editeur occupe l'ecran, et la garde
  // `dansUnChamp` suffit a ne pas voler les frappes de l'inspecteur.
  useEffect(() => {
    if (apercu) {
      return
    }
    const ecouter = (evenement: KeyboardEvent) => {
      const cible = evenement.target
      const action = actionDuClavier({
        key: evenement.key,
        shiftKey: evenement.shiftKey,
        metaKey: evenement.metaKey,
        ctrlKey: evenement.ctrlKey,
        dansUnChamp:
          cible instanceof HTMLElement &&
          CHAMPS_DE_SAISIE.includes(cible.tagName),
      })
      if (!action) {
        return
      }
      evenement.preventDefault()
      appliquer(action)
    }
    addEventListener('keydown', ecouter)
    return () => removeEventListener('keydown', ecouter)
  })

  const [apercu, setApercu] = useState(false)
  const cadre = useRef<HTMLDivElement>(null)
  const [echelle, setEchelle] = useState(0.6)

  // L'echelle fait entrer la page ENTIERE dans le cadre : largeur ET hauteur, plafonnees a 1
  // (on n'agrandit pas au-dela de la taille reelle). On voit ainsi la page d'un coup d'oeil,
  // ce qui est le point d'un editeur de mise en page.
  //
  // Prendre la hauteur ferme AUSSI une boucle possible, et c'est la vraie raison de ne pas
  // revenir a la largeur seule : avec un cadre defilant, la page depasse, la barre de
  // defilement apparait, reduit la largeur utile donc l'echelle donc la hauteur de la page,
  // la barre disparait, et le ResizeObserver repart. En faisant entrer la page, aucune barre
  // n'apparait et la mesure ne depend plus de son propre resultat. (Le gel observe a l'ecran
  // ce jour-la venait en fait du `beforeunload` ci-dessous, pas de cette boucle : celle-ci
  // reste une possibilite fermee par construction, pas un incident constate.)
  useLayoutEffect(() => {
    const element = cadre.current
    if (!element) {
      return
    }
    const observateur = new ResizeObserver(([entree]) => {
      const { width, height } = entree.contentRect
      setEchelle(Math.min(1, width / A4_WIDTH, height / A4_HEIGHT))
    })
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])

  // Garde-fou de sortie : quitter avec des modifications non enregistrees les perd.
  useEffect(() => {
    if (!modifie) {
      return
    }
    const prevenir = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', prevenir)
    return () => removeEventListener('beforeunload', prevenir)
  }, [modifie])

  // LIMITE ASSUMEE : aucun verrou optimiste. Deux onglets ouverts sur le meme design, et le
  // dernier a enregistrer ecrase l'autre sans que rien ne le signale. Un `updatedAt` renvoye
  // par le GET et compare au PATCH fermerait le cas ; ce n'est pas au perimetre de l'etape 2.
  // Ce qui limite les degats en attendant : un design appartient a un service, et son edition
  // est rare.
  const enregistrer = () =>
    saveContent.mutate(
      { id: designId, content: contenu },
      { onSuccess: () => marquerEnregistre() },
    )

  const retour = () =>
    navigate({
      to: '/e/$establishmentId/s/$serviceId/pdf-patient',
      params: { establishmentId, serviceId },
    })

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-48">
            <Button variant="ghost" size="sm" onClick={retour}>
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
            <h1 className="text-text-dark text-xl font-semibold truncate">
              {design?.name ?? 'Design'}
            </h1>
            {modifie && (
              <span className="text-sm text-text-light">
                Modifications non enregistrées
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              aria-label="Annuler"
              disabled={!peutAnnuler}
              onClick={annuler}
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Rétablir"
              disabled={!peutRetablir}
              onClick={retablir}
            >
              <Redo2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => setApercu(!apercu)}>
              {apercu ? (
                <PencilRuler className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {apercu ? 'Éditer' : 'Aperçu PDF'}
            </Button>
            <Button
              onClick={enregistrer}
              isLoading={saveContent.isPending}
              disabled={!modifie}
            >
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
          </div>
        </div>

        {!isPending && !design && (
          <p className="text-sm text-text-light">
            Ce design n'existe plus, ou appartient à un autre service.
          </p>
        )}

        {pagesEditables.length > 1 && !apercu && (
          <div className="flex items-center gap-2">
            {pagesEditables.map((page, rang) => (
              <Button
                key={page.id}
                variant={page.id === pageCourante?.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => choisirPage(page.id)}
              >
                Page {rang + 1}
              </Button>
            ))}
          </div>
        )}

        {apercu ? (
          // La reponse a l'ecart de metriques entre les deux moteurs : le vrai document.
          <div className="flex-1 min-h-0">
            <PDFViewer width="100%" height="100%">
              <Document>
                {pagesOf(contenu, SAMPLE_FIELD_CONTEXT, CALENDRIER_ECHANTILLON)}
              </Document>
            </PDFViewer>
          </div>
        ) : (
          // Le clavier vit sur le conteneur : les raccourcis valent pour toute la zone
          // d'edition, pas pour un element en particulier.
          <div
            className="flex-1 min-h-0 flex gap-4"
            // `application` dit aux lecteurs d'ecran de passer les touches a la page plutot
            // que de les intercepter : c'est le role d'un editeur de toile.
            role="application"
            aria-label="Éditeur de mise en page"
          >
            <aside className="w-40 flex-shrink-0 overflow-auto">
              <Palette onAjouter={ajouterElement} />
            </aside>

            <div
              ref={cadre}
              className="flex-1 min-w-0 overflow-hidden flex items-start justify-center"
            >
              {pageCourante && (
                <ToileEditable
                  page={pageCourante}
                  echelle={echelle}
                  selection={selection}
                  onSelect={choisirElement}
                  onModifier={modifierElement}
                />
              )}
            </div>

            <aside className="w-64 flex-shrink-0 overflow-auto">
              <Inspecteur
                element={elementSelectionne}
                onModifier={(champs) =>
                  selection && modifierElement(selection, champs)
                }
                onSupprimer={supprimerSelection}
                onDupliquer={dupliquerSelection}
                onOrdre={changerOrdre}
              />
            </aside>
          </div>
        )}

        <p className="text-xs text-text-light">
          L'aperçu utilise un patient d'exemple (
          {SAMPLE_FIELD_VALUES['patient.name']}), jamais un vrai dossier.
        </p>
      </div>
    </DashboardLayout>
  )
}
