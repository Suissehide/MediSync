import {
  PATIENTS_CARDIOLOGIE,
  PATIENTS_PNEUMOLOGIE,
} from '../../../../prisma/seed/data/patient'

// Un remaniement de la forme du seed (identite a plat, valeurs cliniques sous `clinicalFile`)
// a, dans le meme geste, fait disparaitre deux patients entiers — Francois Thomas (Cardiologie)
// et Karim Haddad (Pneumologie), avec leurs huit valeurs cliniques — sans qu'aucune porte ne le
// remarque : `tsc`, `prisma db seed` et `npm run lint` sortaient tous a zero, parce que retirer
// deux elements d'un tableau litteral est invisible a tout ce que ce depot sait verifier
// automatiquement. Seule la relecture du diff pouvait le voir, et le diff le cachait : les deux
// blocs supprimes etaient adjacents aux blocs ou `clinicalFile` etait ajoute, ce qui presentait
// la perte comme un simple remaniement.
//
// Ce test rend ce geste impossible a refaire sans le voir : il compte et NOMME les patients de
// chaque service. Toucher `back/prisma/seed/data/patient.ts` — ajouter, retirer ou renommer un
// patient, deplacer un patient d'un service a l'autre — fait rougir ce test, avec le nom
// manquant ou en trop dans le message d'echec de Jest. Le nombre de patients change rarement :
// s'il doit changer, ce test doit changer avec lui, dans le meme commit, en toute connaissance
// de cause — jamais comme effet de bord d'un remaniement de forme.

// Nom complet, dans l'ordre du fichier : suffisant pour detecter un ajout, une suppression, un
// renommage ou une permutation entre patients (deux patients homonymes casseraient d'autres
// invariants du seed avant celui-ci — voir `seedPatients`, qui rattache chaque patient a un
// unique `patientId` par service).
const fullName = (p: { firstName: string; lastName: string }): string =>
  `${p.firstName} ${p.lastName}`

describe('seed/data/patient — inventaire nomme, pas seulement compte', () => {
  it('porte exactement ces dix patients de Cardiologie, dans cet ordre', () => {
    expect(PATIENTS_CARDIOLOGIE.map(fullName)).toEqual([
      'Claire Martin',
      'Julien Durand',
      'Marie Lefebvre',
      'Pierre Bernard',
      'Sophie Moreau',
      'Jean Petit',
      'Isabelle Robert',
      'Michel Richard',
      'Catherine Dubois',
      'François Thomas',
    ])
  })

  it('porte exactement ces six patients de Pneumologie, dans cet ordre', () => {
    expect(PATIENTS_PNEUMOLOGIE.map(fullName)).toEqual([
      'Nadia Belkacem',
      'Thierry Lemoine',
      'Aïcha Diallo',
      'Vincent Rousseau',
      'Émilie Vasseur',
      'Karim Haddad',
    ])
  })

  it('totalise seize patients — dix en Cardiologie, six en Pneumologie', () => {
    expect(PATIENTS_CARDIOLOGIE).toHaveLength(10)
    expect(PATIENTS_PNEUMOLOGIE).toHaveLength(6)
    expect(PATIENTS_CARDIOLOGIE.length + PATIENTS_PNEUMOLOGIE.length).toBe(16)
  })

  // Filet plus large que la seule identite : chaque patient de ce jeu de donnees porte un
  // sous-dossier clinique (voir `seedPatients`, qui cree `PatientServiceFile` uniquement
  // quand `clinicalFile` est present). Un patient reinstaure sans son `clinicalFile`, ou avec
  // un objet vide, serait compte par les deux tests ci-dessus sans que la perte clinique ne
  // soit vue.
  it('chaque patient porte un dossier clinique non vide (medicalDiagnosis renseigne)', () => {
    for (const p of [...PATIENTS_CARDIOLOGIE, ...PATIENTS_PNEUMOLOGIE]) {
      expect(p.clinicalFile).toBeDefined()
      expect(p.clinicalFile?.medicalDiagnosis).toEqual(expect.any(String))
      expect(p.clinicalFile?.medicalDiagnosis.length).toBeGreaterThan(0)
    }
  })
})
