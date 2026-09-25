import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// `runAsSystem` (utils/tenant-context.ts) retire l'exigence du garde-fou d'ORM plutot que de la
// deplacer : sous ce mode, une requete peut lire N'IMPORTE QUEL etablissement et service, le
// garde-fou ne verifiant plus rien (voir infra/orm/tenant-guard.ts, `assertTenantScope`,
// `if (store.kind === 'system') { return }`). C'est une exception assumee au cloisonnement
// multi-tenant, deux fois seulement dans tout le back de production :
//
//   1. La purge planifiee du journal d'activite (`application/starter.ts`,
//      `scheduleActivityLogCleanup`) : hors de toute requete HTTP, il n'existe alors aucun
//      tenant a poser, et la purge doit toucher TOUTE la table, pas un seul etablissement.
//   2. Le signal de suivi ailleurs (`infra/orm/repositories/patientServiceFile.repository.ts`,
//      `estSuiviAilleurs`, design §5.3) : LA SEULE lecture de tout le chantier qui traverse
//      volontairement la frontiere entre services, pour rendre un booleen et rien d'autre.
//
// Une exception a une regle de cloisonnement ne vaut que si elle reste la seule — spec §5.3 :
// "cela se verifie par un test, pas par une relecture." Ce test relit les sources plutot que de
// faire confiance a la memoire, a la maniere de
// `front/src/test/lecture-directe-du-cache.test.ts` : il echoue si `runAsSystem` apparait
// ailleurs que dans les deux emplacements nommes, ET si l'un des deux emplacements nommes cesse
// de l'employer sans que la liste n'en soit averti (les deux sens comptent : un emplacement
// retire de la liste alors qu'il est toujours utilise doit rougir autant qu'un emploi ajoute
// ailleurs).
const APPEL_RUN_AS_SYSTEM = /\.runAsSystem\(/

// Les deux seuls emplois legitimes du back de production. Chaque entree porte un nombre
// D'APPELS, pas un nombre de fichiers : un second appel ajoute dans un fichier deja permis doit
// etre discute, pas herite silencieusement.
const AUTORISES = [
  {
    fichier: 'application/starter.ts',
    raison: 'purge planifiee du journal d activite, hors de toute requete',
    appels: 1,
  },
  {
    fichier: 'infra/orm/repositories/patientServiceFile.repository.ts',
    raison: 'estSuiviAilleurs — le signal de suivi ailleurs',
    appels: 1,
  },
]

// Jest tourne via @swc/jest en module CommonJS (jest.config.ts) : __dirname est disponible.
const RACINE = join(__dirname, '../../../main')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    if (!/\.ts$/.test(entree.name)) {
      return []
    }
    return [chemin]
  })

describe('unicite de l exception runAsSystem au cloisonnement multi-tenant', () => {
  it('n apparait, dans back/src/main, qu aux deux emplacements autorises', () => {
    const trouvees = fichiersDeProduction(RACINE).flatMap((chemin) => {
      const relatif = relative(RACINE, chemin).split(sep).join('/')
      return readFileSync(chemin, 'utf8')
        .split('\n')
        .map((ligne, index) => ({ fichier: relatif, ligne: index + 1, texte: ligne.trim() }))
        .filter((emplacement) => APPEL_RUN_AS_SYSTEM.test(emplacement.texte))
    })

    const interdits = trouvees.filter(
      (emplacement) => !AUTORISES.some((permis) => permis.fichier === emplacement.fichier),
    )

    // Sens 1 : un emploi ajoute ailleurs doit faire rougir ce test. runAsSystem() hors des deux
    // emplacements autorises : cette exception au cloisonnement multi-tenant doit rester unique
    // et declaree (design §5.3, back/CLAUDE.md). Le tableau (vide s'il n'y a rien d'interdit)
    // s'affiche dans le diff Jest en cas d'echec : chaque entree porte deja fichier et ligne.
    expect(interdits).toEqual([])

    // Sens 2 : un emplacement autorise retire de la liste alors qu il est toujours employe (ou
    // dont le nombre d appels a change en silence) doit faire rougir aussi, sans quoi la liste
    // pourrit au premier refactor. `permis.raison` documente pourquoi l'emplacement est permis ;
    // si ce compte tombe a zero ou change, c'est ce commentaire qu'il faut relire.
    for (const permis of AUTORISES) {
      expect(
        trouvees.filter((emplacement) => emplacement.fichier === permis.fichier).length,
      ).toBe(permis.appels)
    }
  })
})
