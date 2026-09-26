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

const email = process.argv[2]

const main = async (): Promise<void> => {
  if (!email) {
    console.error('Usage: npm run bootstrap:super-admin -- <email>')
    process.exitCode = 1
    return
  }

  const { postgresOrm, userDomain } = startIocContainer(loadConfig()).instances

  try {
    await postgresOrm.start()
    const user = await userDomain.bootstrapSuperAdmin(email)
    // Jamais le mot de passe ni le sel : uniquement ce qui prouve l'état obtenu.
    const deactivatedAt =
      user.deactivatedAt === null ? 'null' : user.deactivatedAt.toISOString()
    console.log(
      `OK — ${user.email} est super-admin ` +
        `(isSuperAdmin=${String(user.isSuperAdmin)}, deactivatedAt=${deactivatedAt}).`,
    )
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await postgresOrm.stop()
  }
}

void main()
