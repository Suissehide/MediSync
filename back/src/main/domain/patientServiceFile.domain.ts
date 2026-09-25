import type { IocContainer } from '../types/application/ioc'
import type {
  PatientServiceFileDomainInterface,
  PatientServiceFileEntityDomain,
  PatientServiceFileUpsertEntityDomain,
} from '../types/domain/patientServiceFile.domain.interface'
import type { PatientServiceFileRepositoryInterface } from '../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class PatientServiceFileDomain implements PatientServiceFileDomainInterface {
  private readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({ patientServiceFileRepository, appEventBus }: IocContainer) {
    this.patientServiceFileRepository = patientServiceFileRepository
    this.appEventBus = appEventBus
  }

  findByPatient(patientId: string): Promise<PatientServiceFileEntityDomain | null> {
    return this.patientServiceFileRepository.findByPatient(patientId)
  }

  async upsert(
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
    userID: string,
  ): Promise<PatientServiceFileEntityDomain> {
    const serviceFile = await this.patientServiceFileRepository.upsert(patientId, params)
    // Meme evenement que PATCH /patient/:id ('patient.updated' -> ActivityLogSubscriber) : le
    // sous-dossier porte le contenu clinique qui vivait avant sur le patient, et sa modification
    // doit laisser la meme trace dans le journal d'activite (voir back/src/main/services/
    // activity-log.subscriber.ts). Aucun evenement dedie : ce reste une modification du dossier
    // du meme patient, journalisee sous la meme entite.
    this.appEventBus.emit('patient.updated', { userID, patientId: serviceFile.patientId })
    return serviceFile
  }

  ensureExists(patientId: string): Promise<void> {
    return this.patientServiceFileRepository.ensureExists(patientId)
  }

  // Rattache une identite existante au service courant (design §6, tache 13 — le pendant de
  // "Creer sans parcours" pour un patient qu'on vient de trouver par la recherche d'identite,
  // plutot que de creer). Lit d'abord (findByPatient, deja filtre sur le service courant par
  // `this.scope` dans le depot) pour savoir s'il existe deja un sous-dossier ICI : si oui, ne
  // rien faire d'autre que le dire (consigne 4 du brief — "le cas deja suivi ici" ne doit rien
  // ecraser) ; si non, `ensureExists` le cree vide, jamais en copiant le contenu d'un autre
  // service. `ensureExists` etant lui-meme idempotent (upsert avec `update: {}`, et desormais
  // silencieux sur un P2002 concurrent — voir son commentaire), l'appeler dans les deux cas
  // serait inoffensif — mais le lire d'abord permet de savoir QUOI rendre a l'ecran
  // (`alreadyFollowedHere`) et de n'emettre l'evenement d'activite que pour une creation reelle.
  //
  // IRREVERSIBLE (connu et assume depuis la tache 7, cf. `patientServiceFile.ts` — le routeur ne
  // declare que GET, POST et PATCH, jamais DELETE) : un rattachement sur la mauvaise ligne
  // d'homonymes (deux identites proches, la date de naissance souvent absente) cree un
  // sous-dossier vide qu'aucune route ne permet de retirer, et allume `estSuiviAilleurs` pour
  // tous les autres services de l'etablissement sans retour possible. Meme cout que celui deja
  // assume pour la creation directe d'un patient dans le mauvais service (voir le ruling de la
  // tache 12, `progress.md`), repris ici sur un geste plus facile a declencher par erreur : ne
  // pas rattacher ne perd rien, l'alternative n'est donc pas plus mauvaise. Ne pas ajouter de
  // route de retrait sans re-evaluer cette section et `dossier-service.test.ts`.
  async attachToCurrentService(
    patientId: string,
    userID: string,
  ): Promise<{ patientId: string; alreadyFollowedHere: boolean }> {
    const existing = await this.patientServiceFileRepository.findByPatient(patientId)
    if (existing) {
      return { patientId, alreadyFollowedHere: true }
    }
    await this.patientServiceFileRepository.ensureExists(patientId)
    // Meme evenement que `upsert` ci-dessus ('patient.updated' -> ActivityLogSubscriber) : ce
    // rattachement est une ecriture sur le dossier de ce patient (la creation de son
    // sous-dossier dans ce service), au meme titre imputable qu'une modification de contenu.
    this.appEventBus.emit('patient.updated', { userID, patientId })
    return { patientId, alreadyFollowedHere: false }
  }

  // Passe-plat vers l'exception unique du depot (spec §5.3) : voir
  // PatientServiceFileRepository.estSuiviAilleurs pour ce qu'elle fait et comment.
  estSuiviAilleurs(patientId: string): Promise<boolean> {
    return this.patientServiceFileRepository.estSuiviAilleurs(patientId)
  }
}

export { PatientServiceFileDomain }
