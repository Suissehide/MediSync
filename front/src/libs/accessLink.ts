// Revue finale de l'étape 4a, mineur : les trois écrans qui rendent un
// jeton de premier accès (`createEstablishmentForm.tsx`,
// `createMemberAccountForm.tsx`, `accountSearchPanel.tsx`) annoncent un
// « lien à usage unique » mais n'affichaient que le jeton NU — le
// destinataire recevait quelque chose qui n'est pas un lien, à charge pour
// qui le transmet de reconstituer l'URL à la main. `route/auth/access-link
// .tsx` (la page qui consomme le jeton) vit à `/auth/access-link?token=…`
// — voir `verification-etape-4a.md`, seul endroit qui l'indiquait jusqu'ici.
// Fonction pure, testée indépendamment du rendu : elle ne fait QUE
// concaténer, jamais d'accès réseau ni d'état.
export function buildAccessLinkUrl(token: string): string {
  return `${window.location.origin}/auth/access-link?token=${token}`
}
