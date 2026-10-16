import { Document, PDFViewer } from '@react-pdf/renderer'
import {
  ArrowLeft,
  FileDown,
  Pencil,
  PencilRuler,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '../../../../libs/utils.ts'
import { useSourcesImages } from '../../../../queries/usePdfAsset.ts'
import type { PdfAssetSummary } from '../../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfDesignContent,
  type PdfElement,
} from '../../../../types/pdfDesign.ts'
import DashboardLayout from '../../../dashboard.layout.tsx'
import { Button } from '../../../ui/button.tsx'
import { Input } from '../../../ui/input.tsx'
import { assetIdsDe } from '../assets.ts'
import { SAMPLE_FIELD_CONTEXT } from '../fields.ts'
import { pagesOf } from '../render-pdf.tsx'
import ColonnePages from './colonne-pages.tsx'
import Inspecteur from './inspecteur.tsx'
import { nomsDePages } from './pages.ts'
import {
  type ActionClavier,
  actionDuClavier,
  CHAMPS_DE_SAISIE,
} from './raccourcis.ts'
import { useEdition } from './use-edition.ts'
import { useHistorique } from './use-historique.ts'
import ZoneToile from './zone-toile.tsx'

// L'EDITEUR, SANS SA SOURCE DE DONNEES. Deux ecrans le montent : les designs d'un service
// (sous un tenant) et les modeles livres du super-admin (hors tenant). Les deux ont le meme
// geste d'edition et des sources differentes, d'ou ce decoupage — le dupliquer ferait deriver
// deux editeurs de 400 lignes.
type EditeurDeDesignProps = {
  // `null` tant que la source n'a pas repondu. C'est cette garde qui empeche la colonne de
  // pages de se monter sur un contenu VIDE, et un clic d'y condamner la resynchronisation :
  // l'enregistrement remplacait alors toutes les pages par une page vierge (etape 3).
  design: { id: string; name: string; content: PdfDesignContent } | null
  chargement: boolean
  enregistrementEnCours: boolean
  // Rend une promesse : le composant ne marque « enregistre » qu'au succes.
  onEnregistrer: (contenu: PdfDesignContent) => Promise<unknown>
  onRetour: () => void
  // Le renommage en place. Absent, le crayon du titre n'est pas rendu — un ecran qui ne sait
  // pas renommer ne doit pas en montrer le geste.
  onRenommer?: (nom: string) => Promise<unknown>
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

// Ce que fait chaque action du clavier. Au niveau du module : c'est de l'aiguillage, il n'a
// besoin d'aucun etat a lui.
const executer = (
  action: ActionClavier,
  gestes: {
    annuler: () => void
    retablir: () => void
    choisirElement: (id: string | null) => void
    selection: string | null
    elementSelectionne: PdfElement | null
    supprimerSelection: () => void
    modifierElement: (id: string, champs: Partial<PdfElement>) => void
  },
) => {
  if (action.type === 'annuler') {
    gestes.annuler()
    return
  }
  if (action.type === 'retablir') {
    gestes.retablir()
    return
  }
  if (action.type === 'deselectionner') {
    gestes.choisirElement(null)
    return
  }
  const { selection, elementSelectionne } = gestes
  if (!selection || !elementSelectionne) {
    return
  }
  if (action.type === 'supprimer') {
    gestes.supprimerSelection()
    return
  }
  gestes.modifierElement(selection, {
    x: elementSelectionne.x + action.dx,
    y: elementSelectionne.y + action.dy,
  })
}

// Le nom du design, renommable en place, et l'etat de l'enregistrement sous lui. Son propre
// composant : l'etat du renommage ne concerne que ces deux lignes.
const BlocTitre = ({
  nom,
  modifie,
  onRenommer,
}: {
  // `null` tant que le design n'est pas arrive.
  nom: string | null
  modifie: boolean
  onRenommer?: (nom: string) => Promise<unknown>
}) => {
  const [enCours, setEnCours] = useState<string | null>(null)

  // Un nom vide ou inchange ne part pas : le back le refuserait, et l'ecran afficherait un
  // titre vide le temps de l'aller-retour.
  const valider = () => {
    const suivant = enCours?.trim()
    setEnCours(null)
    if (!suivant || !onRenommer || suivant === nom) {
      return
    }
    onRenommer(suivant).catch(() => undefined)
  }

  return (
    <div className="flex flex-col gap-px flex-1 min-w-0">
      {enCours === null ? (
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-[17px] font-semibold truncate">
            {nom ?? 'Design'}
          </h1>
          {onRenommer && nom && (
            <Button
              variant="transparent"
              size="icon-sm"
              aria-label="Renommer"
              onClick={() => setEnCours(nom)}
            >
              <Pencil className="w-3.5 h-3.5 text-text-sidebar" />
            </Button>
          )}
        </div>
      ) : (
        <Input
          aria-label="Nom du design"
          autoFocus
          value={enCours}
          onChange={(e) => setEnCours(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              valider()
            }
            if (e.key === 'Escape') {
              setEnCours(null)
            }
          }}
          className="h-8 max-w-80"
        />
      )}
      {/* L'etat de l'enregistrement, en permanence : « rien a enregistrer » et « des
          modifications attendent » ne doivent pas se deviner a l'etat d'un bouton. */}
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs',
          modifie ? 'text-a-saisir-texte' : 'text-green-700',
        )}
      >
        <span
          className={cn(
            'w-[7px] h-[7px] rounded-full',
            modifie ? 'bg-a-saisir' : 'bg-termine',
          )}
        />
        {modifie ? 'Modifications non enregistrées' : 'Enregistré'}
      </span>
    </div>
  )
}

export default function EditeurDeDesign({
  design,
  chargement,
  enregistrementEnCours,
  onEnregistrer,
  onRetour,
  onRenommer,
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
    deposerPage,
    dupliquerPage,
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

  // La page courante peut etre le calendrier : il n'a ni toile, ni elements, ni calques.
  const toileCourante = pageCourante?.kind === 'canvas' ? pageCourante : null
  const elementSelectionne =
    toileCourante?.elements.find((e) => e.id === selection) ?? null
  const nomPage =
    nomsDePages(pages)[
      pages.findIndex((page) => page.id === pageCourante?.id)
    ] ?? ''

  // Rien tant que le design n'est pas arrive : `useEdition` tourne alors sur un contenu
  // VIDE, et montrer une page inventee donnerait prise a des gestes qui l'ecraseraient.
  const pageInspectee = design ? (pageCourante ?? null) : null

  const [apercu, setApercu] = useState(false)
  // Coupe au depart : on voit ainsi d'emblee QUELLES parties du texte changeront d'un patient
  // a l'autre. L'interrupteur montre ensuite le document tel qu'il sortira.
  const [donneesExemple, setDonneesExemple] = useState(false)
  const cadre = useRef<HTMLDivElement>(null)
  const [echelle, setEchelle] = useState(0.6)

  // La decision est dans `actionDuClavier`, pure et testee ; l'execution est dans
  // `executer`, au niveau du module. Memorise pour que l'effet du clavier ci-dessous ait des
  // dependances honnetes au lieu de se reabonner a chaque rendu — donc soixante fois par
  // seconde pendant un glissement.
  const appliquer = useCallback(
    (action: ActionClavier) =>
      executer(action, {
        annuler,
        retablir,
        choisirElement,
        selection,
        elementSelectionne,
        supprimerSelection,
        modifierElement,
      }),
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
        altKey: evenement.altKey,
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
  // ce qui est le point d'un editeur de mise en page — et le pied de la toile affiche le
  // pourcentage obtenu, puisqu'il depend de la fenetre.
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
      <div className="flex-1 min-h-0 bg-background rounded-lg flex flex-col w-full overflow-hidden border border-border">
        <div className="h-16 flex-shrink-0 flex items-center gap-3.5 px-5 border-b border-border">
          {/* `ghost` et non `secondary` : la variante secondaire de ce depot est ROSE, la
              couleur d'accent — un retour n'est pas une action mise en avant. */}
          <Button variant="ghost" onClick={onRetour}>
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>

          <BlocTitre
            nom={design?.name ?? null}
            modifie={modifie}
            onRenommer={onRenommer}
          />

          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              aria-label="Annuler"
              disabled={!peutAnnuler}
              onClick={annuler}
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Rétablir"
              disabled={!peutRetablir}
              onClick={retablir}
            >
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={() => setApercu(!apercu)}>
            {apercu ? (
              <PencilRuler className="w-4 h-4" />
            ) : (
              <FileDown className="w-4 h-4" />
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

        {!chargement && !design && (
          <p className="text-sm text-text-light p-5">{messageAbsent}</p>
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
          <div
            className="flex-1 min-h-0 grid grid-cols-[184px_minmax(0,1fr)_320px]"
            // `application` dit aux lecteurs d'ecran de passer les touches a la page plutot
            // que de les intercepter : c'est le role d'un editeur de toile.
            role="application"
            aria-label="Éditeur de mise en page"
          >
            {/* `design &&` comme l'effet d'historique plus haut, et pour la meme raison :
                tant que la requete est en vol, `useEdition` tourne sur un contenu VIDE. Un
                clic sur « Ajouter une page » y ajoutait une page, et comme la
                resynchronisation ne se declenche que `!modifie`, ce geste condamnait le
                design : il arrivait ensuite sans jamais s'afficher, et l'enregistrement
                remplacait toutes ses pages par la page vierge. */}
            {design ? (
              <ColonnePages
                pages={pages}
                courantId={pageCourante?.id ?? null}
                peutAjouterCalendrier={peutAjouterCalendrier}
                onChoisir={choisirPage}
                onAjouterToile={ajouterToile}
                onAjouterCalendrier={ajouterCalendrier}
                onDeposer={deposerPage}
                sources={sources}
              />
            ) : (
              <div className="border-r border-border" />
            )}

            <ZoneToile
              page={pageInspectee}
              echelle={echelle}
              cadre={cadre}
              selection={selection}
              onSelect={choisirElement}
              onModifier={modifierElement}
              onAjouter={ajouterElement}
              donneesExemple={donneesExemple}
              onDonneesExemple={setDonneesExemple}
              sources={sources}
            />

            <aside className="border-l border-border overflow-y-auto">
              <Inspecteur
                page={pageInspectee}
                nomPage={nomPage}
                element={elementSelectionne}
                onChoisirElement={choisirElement}
                assets={assets}
                onDeposer={onDeposer}
                onModifier={(champs) =>
                  selection && modifierElement(selection, champs)
                }
                onSupprimer={supprimerSelection}
                onDupliquer={dupliquerSelection}
                onOrdre={changerOrdre}
                onDupliquerPage={dupliquerPage}
                onSupprimerPage={() =>
                  pageCourante && supprimerPage(pageCourante.id)
                }
                pageSupprimable={pages.length > 1}
              />
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
