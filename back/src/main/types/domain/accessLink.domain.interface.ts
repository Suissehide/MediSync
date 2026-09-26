// Le lien de première connexion / réinitialisation d'accès (spec §6.1, étape 4a tâche 4). Deux
// appelants aujourd'hui : `establishments:manage` (tâche 6, premier administrateur d'un
// établissement) et `members:manage` (tâche 10, compte de membre) — et, sans rien construire de
// plus, la réinitialisation d'un accès oublié, qui n'existe aujourd'hui par aucun moyen.
export interface AccessLinkDomainInterface {
  // Le jeton en clair n'est rendu QU'ICI, à l'émission — jamais relu ensuite (la table ne stocke
  // qu'une empreinte, voir accessLink.repository.ts). `issuedBy` est l'identifiant du compte qui
  // émet le lien (super-admin ou administrateur d'établissement selon l'appelant).
  issue: (userId: string, issuedBy: string) => Promise<{ token: string }>
  // Consomme un lien et pose le mot de passe. Lève :
  //   - `Boom.resourceGone` (410) si le jeton est inconnu, déjà consommé ou expiré ;
  //   - `Boom.unauthorized` (401) si le compte cible est désactivé — SANS consommer le lien
  //     (Review Focus n°5 : refuser ne doit jamais brûler le jeton).
  consume: (token: string, password: string) => Promise<void>
}
