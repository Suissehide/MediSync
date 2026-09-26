import type {
  Establishment,
  EstablishmentMembership,
} from '../../../../../generated/client'
import type { PrimaTransactionClient } from '../client'

export type EstablishmentEntityRepo = Establishment

export interface EstablishmentRepositoryInterface {
  // `Establishment` est un modèle global (spec §4.1) : le garde-fou le laisse déjà passer sans
  // contexte de tenant, rien à encadrer ici. `client` optionnel (tâche 6, tour de correction 1,
  // Important n°2) : `EstablishmentDomain.createWithFirstAdmin` fournit le client de la
  // transaction qui englobe aussi la création du compte, le rattachement et l'émission du lien —
  // un échec de l'un annule les trois autres.
  create: (
    name: string,
    client?: PrimaTransactionClient,
  ) => Promise<EstablishmentEntityRepo>
  // `EstablishmentMembership`, lui, est un modèle d'établissement (ESTABLISHMENT_MODELS,
  // tenant-guard.ts) : sans tenant courant (la route qui appelle ceci n'en a aucun), cette
  // écriture doit passer par le contexte `superadmin` — voir l'implémentation.
  attachAdmin: (
    establishmentId: string,
    userId: string,
    client?: PrimaTransactionClient,
  ) => Promise<EstablishmentMembership>
}
