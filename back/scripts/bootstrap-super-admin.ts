// Tâche 11 (étape 4a) : SEUL moyen de poser `User.isSuperAdmin` — aucune route ne l'écrit,
// délibérément (un compte privilégié posable en un clic serait plus dangereux qu'un script qui
// exige un accès au serveur). Toute la logique vit dans `UserDomain.bootstrapSuperAdmin`
// (src/main/domain/user.domain.ts, testée unitairement dans
// src/test/unit/domain/user.domain.test.ts) : ce fichier n'est qu'un appelant — usage, lecture
// de l'argument, câblage du conteneur, code de sortie. Rien ici ne mérite son propre test.
//
// Usage : npm run bootstrap:super-admin -- <email>

import { loadConfig } from '../src/main/application/config'
import { startIocContainer } from '../src/main/application/starter'
import type { PostgresOrm } from '../src/main/infra/orm/postgres-client'
import { isOwnErrorMessage } from '../src/main/interfaces/http/fastify/errors/error.handler'

const USAGE = 'Usage: npm run bootstrap:super-admin -- <email>'

// Jamais un message d'erreur brut sans distinguer sa provenance (tour de correction 1,
// Important n°2) : un message que NOUS avons écrit (Boom, ou une des erreurs maison du
// garde-fou de tenant — `isOwnErrorMessage`, errors/error.handler.ts, réutilisée telle quelle
// plutôt que réinventée ici) est sûr à afficher ; tout le reste — en particulier une erreur
// Prisma non absorbée — peut recopier une valeur soumise (le `data` de l'écriture qui a
// échoué). Cette règle protège même les écritures que ce script ne maîtrise pas directement :
// `ActivityLogRepository.create` a été corrigée au même tour pour absorber ses propres erreurs
// Prisma (elle ne le faisait pas, contrairement à ses voisines), mais une autre source
// imprévue reste possible, et cette ligne d'affichage ne lui fait pas confiance par défaut.
const diagnose = (err: unknown): string => {
  if (isOwnErrorMessage(err) && err instanceof Error) {
    return err.message
  }
  const errorClass = err instanceof Error ? err.constructor.name : typeof err
  return `Erreur inattendue [${errorClass}]`
}

const main = async (): Promise<void> => {
  // Args surnuméraires refusés plutôt qu'ignorés (tour de correction 1, mineur n°3) : un outil
  // qui pose un drapeau de ce pouvoir ne devine pas ce qu'un opérateur voulait dire par un
  // deuxième argument.
  const [email, ...extra] = process.argv.slice(2)
  if (!email || extra.length > 0) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  // Construction du conteneur IoC placée DANS le try (tour de correction 1, mineur n°2) : une
  // erreur de câblage (config invalide, connexion refusée...) doit suivre le même chemin
  // d'erreur que le reste, pas rejeter hors de tout `catch` avec un message non filtré.
  let postgresOrm: PostgresOrm | undefined
  try {
    const instances = startIocContainer(loadConfig()).instances
    postgresOrm = instances.postgresOrm
    await postgresOrm.start()

    const { user, granted, reactivated } =
      await instances.userDomain.bootstrapSuperAdmin(email)

    // Jamais le mot de passe ni le sel : uniquement ce qui prouve l'état obtenu.
    if (!granted && !reactivated) {
      console.log(
        `OK — ${user.email} était déjà super-admin et actif : rien à faire.`,
      )
    } else {
      if (granted) {
        console.log(`OK — ${user.email} est maintenant super-admin.`)
      }
      // Annonce explicite (revue, tour de correction 1) : un effet de bord de ce pouvoir ne
      // doit jamais rester silencieux, même quand promouvoir ET réactiver est le bon choix.
      if (reactivated) {
        console.log(
          `OK — ${user.email} était désactivé : le compte a été RÉACTIVÉ au passage ` +
            '(seul recours, aucune route ne peut réactiver un super-admin).',
        )
      }
    }
  } catch (err) {
    console.error(diagnose(err))
    process.exitCode = 1
  } finally {
    await postgresOrm?.stop()
  }
}

void main()
