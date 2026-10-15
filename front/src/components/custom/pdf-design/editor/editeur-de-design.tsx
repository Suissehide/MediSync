import { Document, PDFViewer } from '@react-pdf/renderer'
import { ArrowLeft, Eye, PencilRuler, Redo2, Save, Undo2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { useSourcesImages } from '../../../../queries/usePdfAsset.ts'
import type { PdfAssetSummary } from '../../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfDesignContent,
} from '../../../../types/pdfDesign.ts'
import DashboardLayout from '../../../dashboard.layout.tsx'
import { Button } from '../../../ui/button.tsx'
import { SAMPLE_FIELD_CONTEXT, SAMPLE_FIELD_VALUES } from '../fields.ts'
import { assetIdsDe } from '../assets.ts'
import { pagesOf } from '../render-pdf.tsx'
import BandePages from './bande-pages.tsx'
import Inspecteur from './inspecteur.tsx'
import Palette from './palette.tsx'
import {
  type ActionClavier,
  actionDuClavier,
  CHAMPS_DE_SAISIE,
} from './raccourcis.ts'
import ToileEditable from './toile-editable.tsx'
import { useEdition } from './use-edition.ts'
import { useHistorique } from './use-historique.ts'

// L'EDITEUR, SANS SA SOURCE DE DONNEES. Deux ecrans le montent : les designs d'un service
// (sous un tenant) et les modeles livres du super-admin (hors tenant). Les deux ont le meme
// geste d'edition et des sources differentes, d'ou ce decoupage — le dupliquer ferait deriver
// deux editeurs de 350 lignes.
type EditeurDeDesignProps = {
  // `null` tant que la source n'a pas repondu. C'est cette garde qui empeche la bande de
  // pages de se monter sur un contenu VIDE, et un clic d'y condamner la resynchronisation :
  // l'enregistrement remplacait alors toutes les pages par une page vierge (etape 3).
  design: { id: string; name: string; content: PdfDesignContent } | null
  chargement: boolean
  enregistrementEnCours: boolean
  // Rend une promesse : le composant ne marque « enregistre » qu'au succes.
  onEnregistrer: (contenu: PdfDesignContent) => Promise<unknown>
  onRetour: () => void
  // Absents pour un modele livre : il n'utilise que les images de l'application, et promettre
  // un depot afficherait un champ dont le resultat ne pourrait jamais y etre pose.
  assets?: PdfAssetSummary[]
  onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
  // La phrase quand il n'y a pas de design : elle differe d'un ecran a l'autre.
  messageAbsent: string
}

const CONTENU_VIDE: PdfDesignContent = { version: 1, pages: [] }

// Le calendrier d'apercu n'a ni patient ni creneau : l'editeur ne montre jamais un vrai
// dossier, et SAMPLE_FIELD_CONTEXT est son seul jeu de donnees.
const CALENDRIER_ECHANTILLON = {
  upcomingSlots: [],
  patientId: 'apercu',
  forbiddenWeekStarts: [],
  noticeByThematicId: new Map<string, string>(),
}

export default function EditeurDeDesign({
  design,
  chargement,
  enregistrementEnCours,
  onEnregistrer,
  onRetour,
  assets,
  onDeposer,
  messageAbsent,
}: EditeurDeDesignProps) {
  const {
    contenu,
    pages,
    pageCourante,
    peutAjouterCalendrier,
    choisirPage,
    ajouterToile,
    ajouterCalendrier,
    supprimerPage,
    deplacerPage,
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

  // Sur le contenu VIVANT, et c'est tout l'enjeu : resoudre sur `design.content` — la version
  // du serveur — rendait INVISIBLE toute image que l'utilisateur vient de choisir, jusqu'au
  // prochain enregistrement. Il posait et redimensionnait un element que rien n'affichait.
  // Pour un modele livre, `assetIdsDe` rend un tableau vide (il ne collecte que `assetId`,
  // jamais `builtin`) : aucune requete ne part, et l'ecran super-admin reste hors tenant.
  const { sources } = useSourcesImages(assetIdsDe(contenu))

  // L'historique se branche ici, sur le contenu lui-meme : il regroupe les rafales d'un
  // geste et ignore ce qu'il vient de restaurer.
  //
  // Rien tant que le design n'est pas arrive : sinon le contenu VIDE du montage devient le
  // point de retour, et 400 ms apres l'ouverture « Annuler » vide la toile — « Enregistrer »
  // repond alors 400 (le schema exige au moins une page) et quitter reveille le beforeunload.
  useEffect(() => {
    if (!design) {
      return
    }
    synchroniser(contenu)
  }, [contenu, synchroniser, design])

  // La page courante peut etre le calendrier : il n'a ni toile, ni elements, ni inspecteur.
  const toileCourante = pageCourante?.kind === 'canvas' ? pageCourante : null
  const elementSelectionne =
    toileCourante?.elements.find((e) => e.id === selection) ?? null

  const [apercu, setApercu] = useState(false)
  const cadre = useRef<HTMLDivElement>(null)
  const [echelle, setEchelle] = useState(0.6)

  // La decision est dans `actionDuClavier`, pure et testee ; ici ne reste que l'execution.
  // Memorise pour que l'effet du clavier ci-dessous ait des dependances honnetes au lieu de
  // se reabonner a chaque rendu — donc soixante fois par seconde pendant un glissement.
  const appliquer = useCallback(
    (action: ActionClavier) => {
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
    },
    [
      annuler,
      retablir,
      choisirElement,
      selection,
      elementSelectionne,
      supprimerSelection,
      modifierElement,
    ],
  )

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
  }, [apercu, appliquer])

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
  // `marquerEnregistre` SEULEMENT au succes : le marquer avant la reponse ferait retomber
  // l'ecran sur la version du serveur, defaut corrige a l'etape 2.
  const enregistrer = () => {
    onEnregistrer(contenu)
      .then(() => marquerEnregistre())
      .catch(() => undefined)
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-48">
            <Button variant="ghost" size="sm" onClick={onRetour}>
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
              isLoading={enregistrementEnCours}
              disabled={!modifie}
            >
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
          </div>
        </div>

        {!chargement && !design && (
          <p className="text-sm text-text-light">{messageAbsent}</p>
        )}

        {apercu ? (
          // La reponse a l'ecart de metriques entre les deux moteurs : le vrai document.
          <div className="flex-1 min-h-0">
            <PDFViewer width="100%" height="100%">
              <Document>
                {pagesOf(
                  contenu,
                  SAMPLE_FIELD_CONTEXT,
                  CALENDRIER_ECHANTILLON,
                  sources,
                )}
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
              {toileCourante && <Palette onAjouter={ajouterElement} />}
            </aside>

            <div
              ref={cadre}
              className="flex-1 min-w-0 overflow-hidden flex items-start justify-center"
            >
              {toileCourante ? (
                <ToileEditable
                  page={toileCourante}
                  echelle={echelle}
                  selection={selection}
                  onSelect={choisirElement}
                  onModifier={modifierElement}
                  sources={sources}
                />
              ) : (
                <p className="text-sm text-text-light self-center max-w-md text-center">
                  Cette page est produite à partir des rendez-vous du patient :
                  son contenu change d'un patient à l'autre, il ne se compose
                  pas ici. L'aperçu PDF la montre telle qu'elle sortira.
                </p>
              )}
            </div>

            <aside className="w-64 flex-shrink-0 overflow-auto">
              <Inspecteur
                element={elementSelectionne}
                assets={assets}
                onDeposer={onDeposer}
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

        {/* `design &&` comme l'effet d'historique plus haut, et pour la meme raison :
            tant que la requete est en vol, `useEdition` tourne sur un contenu VIDE. Un clic
            ici y ajoutait une page, et comme la resynchronisation ne se declenche que
            `!modifie`, le design arrive ensuite sans jamais s'afficher — l'enregistrement
            remplacait alors toutes ses pages par la page vierge. */}
        {!apercu && design && (
          <BandePages
            pages={pages}
            courantId={pageCourante?.id ?? null}
            peutAjouterCalendrier={peutAjouterCalendrier}
            onChoisir={choisirPage}
            onAjouterToile={ajouterToile}
            onAjouterCalendrier={ajouterCalendrier}
            onSupprimer={supprimerPage}
            onDeplacer={deplacerPage}
            sources={sources}
          />
        )}

        <p className="text-xs text-text-light">
          L'aperçu utilise un patient d'exemple (
          {SAMPLE_FIELD_VALUES['patient.name']}), jamais un vrai dossier.
        </p>
      </div>
    </DashboardLayout>
  )
}
