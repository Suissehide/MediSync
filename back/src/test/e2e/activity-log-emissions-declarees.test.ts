import {
  BORNE_BASSE_EVENEMENTS,
  type EvenementDeclare,
  evenementsDansSource,
  evenementsDeclares,
} from '../shared/app-events-source'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

// LA GARDE DYNAMIQUE — ce que le statique ne peut pas voir.
//
// Un garde-fou STATIQUE (« chaque evenement declare dans `AppEvents` a-t-il une souscription
// `.on(...)` ? ») n'attrape PAS le vrai defaut deja rencontre ici : `user.accessLinkReissued`
// ETAIT souscrit — c'est la LIGNE qui mourait, avalee par le `catch` de `#log` apres un refus du
// garde-fou de tenant (`ActivityLog` est un modele d'etablissement, refuse sans store). Rien
// n'echouait, rien ne manquait visiblement ; seule la trace disparaissait. Ce defaut a deja mordu
// DEUX FOIS sur ce chantier — la colonne auteur videe en silence (`findByID` sous
// tenant), la ligne elle-meme jamais ecrite ici — les deux fois sans le moindre signal.
//
// Ce fichier prouve donc, par EXECUTION, que chaque evenement declare produit reellement une
// ligne quand il est emis sous le contexte ou il l'est reellement en production — jamais sous un
// contexte suppose. Trois pieces :
//   1. Les evenements sont lus depuis la SOURCE de `AppEvents` (`app-event-bus.ts`, lu par
//      `../shared/app-events-source.ts`), jamais recopies a la main : un evenement ajoute au
//      type et oublie ici fait echouer ce fichier plutot que de passer inapercu — Y COMPRIS
//      declare sur plusieurs lignes, ce qui n'etait pas garanti auparavant
//      (voir le commentaire de ce module, et l'`EXEMPLE_MULTILIGNE` plus bas qui le tient).
//   2. `CONTEXTES_REELS` : UNE entree par evenement, qui NOMME le contexte sous lequel ce site
//      d'appel emet reellement (tenant de service, tenant d'administration, ou aucun contexte —
//      voir le site d'appel cite sur chaque ligne). Jamais un contexte suppose ou choisi pour
//      faire passer le test.
//   3. `EXEMPTIONS` : une liste NOMMEE, jamais un pourcentage implicite — vide aujourd'hui.
//      Un evenement absent des deux echoue ce fichier en listant precisement lequel.
//
// SABOTAGE QUI DEVRAIT FAIRE ROUGIR CE FICHIER (verifie par execution) :
// retirer la souscription d'un evenement (`#subscribe`, activity-log.subscriber.ts) — plus rien
// n'ecrit sous son action, ce fichier rougit sur CET evenement precis, jamais sur un autre. Le
// VRAI Prisma garde-fou (`infra/orm/tenant-guard.ts`) est celui qui tourne ici (via `buildTestApp`,
// la vraie base de test) : contrairement a un simple bouchon de depot, il refuse REELLEMENT une
// ecriture sur `ActivityLog` sans store, exactement ce qui a fait tomber la ligne dans le cas
// reel decrit plus haut —
// c'est pour ca que ce fichier vit en e2e, jamais en unitaire (un depot bouchonne ne peut pas
// reproduire ce refus).
type ContexteReel =
  // Route de service (`/e/:e/s/:s/...`) : tenant complet, avec un service courant.
  | { genre: 'tenant-service' }
  // Route d'administration d'etablissement (`/e/:e/admin/...`) : tenant SANS service courant —
  // meme motif que `activityLog.repository.ts#serviceFilter` (« la gestion des membres se fait
  // dans le contexte d'administration, qui n'a pas de service »).
  | { genre: 'tenant-administration' }
  // Aucun store du tout — le prefixe `/super-admin`, qui ne rentre dans AUCUN contexte
  // (back/CLAUDE.md : « /auth, /me et tout /super-admin tournent sans store »).
  | { genre: 'aucun' }

// UNE entree par evenement declare — le site d'appel reel de `appEventBus.emit` justifie chaque
// valeur, jamais une supposition :
const CONTEXTES_REELS: Record<string, ContexteReel> = {
  // domain/patient.domain.ts : toutes les routes patient sont sous `/e/:e/s/:s/patient`.
  'patient.created': { genre: 'tenant-service' },
  'patient.updated': { genre: 'tenant-service' },
  'patient.deleted': { genre: 'tenant-service' },
  'patient.enrolled': { genre: 'tenant-service' },
  'patient.removedFromPathway': { genre: 'tenant-service' },
  // domain/diagnosticEducatif.domain.ts : sous `/e/:e/s/:s/...`.
  'diagnostic.created': { genre: 'tenant-service' },
  'diagnostic.updated': { genre: 'tenant-service' },
  // domain/appointment.domain.ts : sous `/e/:e/s/:s/...`.
  'appointment.created': { genre: 'tenant-service' },
  'appointment.updated': { genre: 'tenant-service' },
  // domain/membership.domain.ts : toutes les routes de gestion des membres sont sous
  // `/e/:e/admin/members`, jamais sous un service.
  'member.added': { genre: 'tenant-administration' },
  'member.updated': { genre: 'tenant-administration' },
  'member.removed': { genre: 'tenant-administration' },
  'member.deactivated': { genre: 'tenant-administration' },
  'member.reactivated': { genre: 'tenant-administration' },
  'member.accountCreated': { genre: 'tenant-administration' },
  'member.accessLinkReissued': { genre: 'tenant-administration' },
  // domain/membership.domain.ts, surface de service : sous `/e/:e/s/:s/membres`.
  'serviceMember.added': { genre: 'tenant-service' },
  'serviceMember.accountCreated': { genre: 'tenant-service' },
  'serviceMember.updated': { genre: 'tenant-service' },
  'serviceMember.removed': { genre: 'tenant-service' },
  // domain/user.domain.ts#reissueAccessLink : sous `/super-admin`, aucun store.
  'user.accessLinkReissued': { genre: 'aucun' },
}

// Liste NOMMEE, jamais un pourcentage implicite : un evenement
// present ici est EXEMPTE de cette preuve, avec sa raison ecrite a cote. Vide aujourd'hui — tous
// les evenements declares passent par `ActivityLogSubscriber.#log` et doivent donc ecrire.
const EXEMPTIONS: Record<string, string> = {}

// Lit les evenements DEPUIS LA SOURCE plutot que de les recopier a la main (meme philosophie que
// `runAsSystem-unicite.test.ts`, qui grep sa propre source plutot que de maintenir une liste
// separee qui pourrait deriver).
//
// LA LECTURE ELLE-MEME VIT DANS `../shared/app-events-source.ts` : elle etait ecrite ici,
// en une regex LIGNE PAR LIGNE qui exigeait l'accolade
// fermante sur la meme ligne, et ECHOUAIT DONC OUVERT sur un evenement declare sur plusieurs
// lignes — voir le commentaire de ce module pour la mesure et le remede. Elle est desormais
// partagee avec le contrat de vocabulaire (`unit/utils/access-log-vocabulaire.test.ts`), pour
// que les deux tests posent exactement la meme question a la meme source.

// Charge synthetique minimale : une chaine distincte par champ, derivee de son nom — jamais une
// valeur qui ressemble a une donnee reelle (aucun email, aucun jeton).
const chargeSynthetique = (
  evenement: EvenementDeclare,
): Record<string, string> =>
  Object.fromEntries(
    evenement.champs.map((champ) => [champ, `synthetique-${champ}`]),
  )

// LA PREUVE PAR L'EXEMPLE MULTILIGNE. Ce `describe` est
// la contre-epreuve de la lecture elle-meme : il ne regarde pas `app-event-bus.ts`, il donne a
// `evenementsDansSource` la forme que le motif precedent ne voyait pas, et exige qu'elle la
// voie. Avec la lecture ligne par ligne d'avant, le second cas ci-dessous rend `[]` pour
// `facture.emise` et ce fichier rougit — c'est le sens du correctif.
const EXEMPLE_MULTILIGNE = `
type AppEvents = {
  'patient.created':    { userID: string; patientId: string }
  'facture.emise': {
    userID: string
    factureId: string
    etablissementId: string
    montantCentimes: number
  }
}
`

describe('la lecture de AppEvents voit un evenement declare sur plusieurs lignes', () => {
  it('rend les DEUX evenements de l exemple, monoligne et multiligne', () => {
    expect(evenementsDansSource(EXEMPLE_MULTILIGNE).map((e) => e.nom)).toEqual([
      'patient.created',
      'facture.emise',
    ])
  })

  it('rend les champs `string` de la charge multiligne, sans le champ numerique', () => {
    const facture = evenementsDansSource(EXEMPLE_MULTILIGNE).find(
      (e) => e.nom === 'facture.emise',
    )
    expect(facture?.champs).toEqual(['userID', 'factureId', 'etablissementId'])
  })

  // Un evenement multiligne NON CLASSE doit faire echouer le recouvrement, pas passer inapercu :
  // c'est la propriete que l'en-tete de ce fichier promet, rejouee ici sur la forme qui la
  // mettait en defaut. Le sabotage exact prouve avant ce correctif — quatre lignes ajoutees a
  // `AppEvents`, rien ajoute a `CONTEXTES_REELS` — laissait le fichier 18/18 vert.
  it('un evenement multiligne absent des deux tables est bien signale comme non classe', () => {
    const noms = evenementsDansSource(EXEMPLE_MULTILIGNE).map((e) => e.nom)
    const nonClasses = noms.filter(
      (nom) => !(nom in CONTEXTES_REELS) && !(nom in EXEMPTIONS),
    )
    expect(nonClasses).toEqual(['facture.emise'])
  })
})

describe('chaque evenement declare est classe (contexte reel ou exemption nommee)', () => {
  // La lecture ne doit jamais rendre MOINS que ce qui est connu : une liste vide (fichier
  // renomme, bloc introuvable) rendrait tout le reste de ce fichier vert en ne testant rien.
  it('voit au moins autant d evenements qu au jour ou cette borne a ete posee', () => {
    expect(evenementsDeclares().length).toBeGreaterThanOrEqual(
      BORNE_BASSE_EVENEMENTS,
    )
  })

  it('AppEvents, CONTEXTES_REELS et EXEMPTIONS se recouvrent exactement', () => {
    const noms = evenementsDeclares().map((e) => e.nom)
    const nonClasses = noms.filter(
      (nom) => !(nom in CONTEXTES_REELS) && !(nom in EXEMPTIONS),
    )
    expect(nonClasses).toEqual([])

    // Sens inverse : une entree qui ne correspond plus a aucun evenement declare (renomme,
    // retire) doit aussi se voir, plutot que de vieillir en silence.
    const perimees = Object.keys(CONTEXTES_REELS).filter(
      (nom) => !noms.includes(nom),
    )
    expect(perimees).toEqual([])
  })
})

describe("chaque evenement declare ecrit une ligne d'activite sous son contexte reel", () => {
  let testApp: TestApp

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  // Attend l'apparition de la ligne, sans jamais rendre vert un journal vide (meme convention
  // que `activity-log-auteur.test.ts`) : l'ecriture passe par `appEventBus.emit`, jamais attendue
  // par l'appelant.
  const attendreLigne = async (action: string) => {
    for (let essai = 0; essai < 40; essai += 1) {
      const lignes = await testDb.activityLog.findMany({ where: { action } })
      if (lignes.length > 0) {
        return lignes
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return []
  }

  const casDeTest = evenementsDeclares()
    .filter((evenement) => !(evenement.nom in EXEMPTIONS))
    .map((evenement) => {
      const contexte = CONTEXTES_REELS[evenement.nom]
      if (!contexte) {
        // Deja signale par le describe precedent — evite un second message confus ici.
        return [evenement.nom, 'genre inconnu', evenement] as const
      }
      return [evenement.nom, contexte.genre, evenement] as const
    })

  it.each(casDeTest)(
    '%s, sous le contexte reel « %s » : une ligne apparait',
    async (nomEvenement, genreContexte, evenement) => {
      const { appEventBus, tenantContext } = testApp.instances

      if (genreContexte === 'tenant-service') {
        tenantContext.enter({
          userId: 'synthetique-acteur',
          establishmentId: 'synthetique-etablissement',
          establishmentRole: 'ADMIN',
          serviceId: 'synthetique-service',
          serviceRole: 'COORDINATEUR',
          soignantId: null,
        })
      } else if (genreContexte === 'tenant-administration') {
        tenantContext.enter({
          userId: 'synthetique-acteur',
          establishmentId: 'synthetique-etablissement',
          establishmentRole: 'ADMIN',
          serviceId: null,
          serviceRole: null,
          soignantId: null,
        })
      } else if (genreContexte === 'aucun') {
        tenantContext.clear()
      } else {
        throw new Error(
          `${nomEvenement} : aucun contexte reel declare (voir CONTEXTES_REELS)`,
        )
      }

      appEventBus.emit(
        nomEvenement as never,
        chargeSynthetique(evenement) as never,
      )

      const lignes = await attendreLigne(nomEvenement)
      expect(lignes.length).toBeGreaterThan(0)
    },
  )
})
