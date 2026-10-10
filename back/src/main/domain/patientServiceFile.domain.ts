import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PatientServiceFileDomainInterface,
  PatientServiceFileEntityDomain,
  PatientServiceFileUpsertEntityDomain,
} from '../types/domain/patientServiceFile.domain.interface'
import type { PatientServiceFileRepositoryInterface } from '../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'
import {
  asFieldType,
  asValues,
  type FieldDefinitionForValidation,
  mergeFieldPatch,
  toJsonObject,
} from '../utils/service-field-types'

class PatientServiceFileDomain implements PatientServiceFileDomainInterface {
  private readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({
    patientServiceFileRepository,
    serviceFieldRepository,
    appEventBus,
  }: IocContainer) {
    this.patientServiceFileRepository = patientServiceFileRepository
    this.serviceFieldRepository = serviceFieldRepository
    this.appEventBus = appEventBus
  }

  findByPatient(
    patientId: string,
  ): Promise<PatientServiceFileEntityDomain | null> {
    return this.patientServiceFileRepository.findByPatient(patientId)
  }

  async upsert(
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
    userID: string,
  ): Promise<PatientServiceFileEntityDomain> {
    const { data, clinicalData, ...fixed } = params
    // Valide avant de creer quoi que ce soit : un 400 ne doit laisser aucune trace, pas meme un sous-dossier vide.
    if (data !== undefined || clinicalData !== undefined) {
      await this.validateValues(patientId, data ?? {}, clinicalData ?? {})
      await this.patientServiceFileRepository.ensureExists(patientId)
      await this.writeValues(patientId, data ?? {}, clinicalData ?? {})
    }
    const serviceFile = await this.patientServiceFileRepository.upsert(
      patientId,
      fixed,
    )
    // Meme evenement que PATCH /patient/:id : journalise sous la meme entite (activity-log.subscriber.ts).
    this.appEventBus.emit('patient.updated', {
      userID,
      patientId: serviceFile.patientId,
    })
    return serviceFile
  }

  private async fieldDefinitions(): Promise<FieldDefinitionForValidation[]> {
    return (await this.serviceFieldRepository.findAll()).flatMap(
      (d): FieldDefinitionForValidation[] => {
        const type = asFieldType(d.type)
        return type ? [{ ...d, type }] : []
      },
    )
  }

  // Rejoue la validation de `writeValues` sur l'etat actuel (ou {} si le patient n'a encore aucun sous-dossier ici) : un correctif invalide ne doit creer aucune ligne PatientServiceFile.
  private async validateValues(
    patientId: string,
    dataPatch: Record<string, unknown>,
    clinicalPatch: Record<string, unknown>,
  ): Promise<void> {
    const definitions = await this.fieldDefinitions()
    const current =
      await this.patientServiceFileRepository.findByPatient(patientId)
    mergeFieldPatch(definitions, asValues(current?.data), dataPatch, false)
    mergeFieldPatch(
      definitions,
      asValues(current?.clinicalData),
      clinicalPatch,
      true,
    )
  }

  // Concurrence optimiste : on n'ecrit que si les colonnes JSON n'ont pas bouge depuis la lecture.
  private async writeValues(
    patientId: string,
    dataPatch: Record<string, unknown>,
    clinicalPatch: Record<string, unknown>,
  ): Promise<void> {
    const definitions = await this.fieldDefinitions()
    for (let attempt = 0; attempt < 3; attempt++) {
      const current =
        await this.patientServiceFileRepository.findByPatient(patientId)
      if (!current) {
        throw Boom.notFound('PatientServiceFile not found')
      }
      const next = {
        data: toJsonObject(
          mergeFieldPatch(
            definitions,
            asValues(current.data),
            dataPatch,
            false,
          ),
        ),
        clinicalData: toJsonObject(
          mergeFieldPatch(
            definitions,
            asValues(current.clinicalData),
            clinicalPatch,
            true,
          ),
        ),
      }
      if (
        await this.patientServiceFileRepository.writeValues(
          patientId,
          current,
          next,
        )
      ) {
        return
      }
    }
    throw Boom.conflict('Le dossier a été modifié en même temps, réessayez.')
  }

  ensureExists(patientId: string): Promise<void> {
    return this.patientServiceFileRepository.ensureExists(patientId)
  }

  // Rattache une identite existante au service courant (design §6 — le pendant de
  // "Creer sans parcours" pour un patient qu'on vient de trouver par la recherche d'identite,
  // plutot que de creer). Lit d'abord (findByPatient, deja filtre sur le service courant par
  // `this.scope` dans le depot) pour savoir s'il existe deja un sous-dossier ICI : si oui, ne
  // rien faire d'autre que le dire ("le cas deja suivi ici" ne doit rien
  // ecraser) ; si non, `ensureExists` le cree vide, jamais en copiant le contenu d'un autre
  // service. `ensureExists` etant lui-meme idempotent (upsert avec `update: {}`, et desormais
  // silencieux sur un P2002 concurrent — voir son commentaire), l'appeler dans les deux cas
  // serait inoffensif — mais le lire d'abord permet de savoir QUOI rendre a l'ecran
  // (`alreadyFollowedHere`) et de n'emettre l'evenement d'activite que pour une creation reelle.
  //
  // IRREVERSIBLE (connu et assume, cf. `patientServiceFile.ts` — le routeur ne
  // declare que GET, POST et PATCH, jamais DELETE) : un rattachement sur la mauvaise ligne
  // d'homonymes (deux identites proches, la date de naissance souvent absente) cree un
  // sous-dossier vide qu'aucune route ne permet de retirer, et allume `estSuiviAilleurs` pour
  // tous les autres services de l'etablissement sans retour possible. Meme cout que celui deja
  // assume pour la creation directe d'un patient dans le mauvais service (voir D6,
  // `docs/multi-tenant/decisions-etape-3.md`), repris ici sur un geste plus facile a declencher par erreur : ne
  // pas rattacher ne perd rien, l'alternative n'est donc pas plus mauvaise. Ne pas ajouter de
  // route de retrait sans re-evaluer cette section et `dossier-service.test.ts`.
  async attachToCurrentService(
    patientId: string,
    userID: string,
  ): Promise<{ patientId: string; alreadyFollowedHere: boolean }> {
    const existing =
      await this.patientServiceFileRepository.findByPatient(patientId)
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
