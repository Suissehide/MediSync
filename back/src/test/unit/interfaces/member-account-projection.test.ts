import {
  createMemberAccountResponseSchema,
  projectCreatedMember,
} from '../../../main/interfaces/http/fastify/schemas/members.schema'

// `POST /e/:id/admin/members/account` protege la reponse DEUX fois : la route projette
// explicitement l'appartenance sur les seules colonnes que l'appelant vient d'ecrire, PUIS le
// schema Zod elague ce qui resterait. La premiere des deux n'est tenue par rien d'autre —
// remplacer la projection par `return { member, accessLink }` laisserait les 26 tests membres
// verts, Zod elaguant seul.
//
// Une defense en profondeur dont une seule couche est eprouvee n'a qu'une couche. Ce fichier
// tient la couche que le HTTP ne peut pas montrer.
//
// CE QUE CHAQUE COUCHE PROTEGE, et pourquoi le bloc `user` ne doit pas sortir : sur une adresse
// qui a DEJA un compte, `user.firstName`/`user.lastName` rendraient la valeur STOCKEE et non
// celle SOUMISE, et `user.id` est un cuid — qui encode l'instant de creation du compte. Trois
// oracles d'existence de comptes, dans des VALEURS plutot que dans la forme (meme lecon que pour
// `createEstablishmentResponseSchema`).
const CLES_ATTENDUES = ['id', 'role', 'serviceMemberships']

// Une ligne d'appartenance telle que le domaine la rend : complete, identite comprise.
const appartenanceComplete = {
  id: 'em1',
  userId: 'u1',
  establishmentId: 'e1',
  role: 'MEMBER' as const,
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  serviceMemberships: [{ serviceId: 's1', role: 'INTERVENANT' as const }],
  user: {
    id: 'u1',
    email: 'ancienne@adresse.fr',
    firstName: 'NomStocke',
    lastName: 'DifferentDuSoumis',
    deactivatedAt: null,
  },
}

describe('reponse de la creation d un compte de membre', () => {
  it('la projection de la route ne laisse passer que les colonnes soumises par l appelant', () => {
    const projete = projectCreatedMember(appartenanceComplete)

    expect(Object.keys(projete).sort()).toEqual(CLES_ATTENDUES)
    // Ni le nom stocke, ni l'identifiant du compte, ni l'adresse : aucune valeur que
    // l'appelant n'ait pas ecrite lui-meme.
    expect(JSON.stringify(projete)).not.toContain('NomStocke')
    expect(JSON.stringify(projete)).not.toContain('DifferentDuSoumis')
    expect(JSON.stringify(projete)).not.toContain('ancienne@adresse.fr')
    expect(JSON.stringify(projete)).not.toContain('u1')
    // Ce que la projection doit au contraire CONSERVER : sans cela elle serait « sure » en
    // ne rendant rien, et l'ecran n'aurait plus de quoi se mettre a jour.
    expect(projete.serviceMemberships).toEqual([
      { serviceId: 's1', role: 'INTERVENANT' },
    ])
  })

  it('le schema elague a son tour, si la projection etait un jour retiree', () => {
    // La SECONDE couche, eprouvee independamment : on donne au schema la ligne COMPLETE, telle
    // qu'elle arriverait si la route rendait `{ member, accessLink }` sans projeter.
    const serialise = createMemberAccountResponseSchema.parse({
      member: appartenanceComplete,
      accessLink: { token: 'JETON-FACTICE-DE-TEST' },
    })

    expect(Object.keys(serialise.member).sort()).toEqual(CLES_ATTENDUES)
    expect(JSON.stringify(serialise.member)).not.toContain('NomStocke')
  })
})
