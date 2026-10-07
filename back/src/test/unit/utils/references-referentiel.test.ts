import { phraseDesReferences } from '../../../main/utils/references-referentiel'

describe('phrase qui nomme les references bloquantes', () => {
  const rdv = { singulier: 'rendez-vous', pluriel: 'rendez-vous' }
  const creneau = { singulier: 'créneau modèle', pluriel: 'créneaux modèles' }
  const tache = { singulier: 'tâche', pluriel: 'tâches' }

  it('rend null quand rien ne reference : c est le feu vert', () => {
    expect(
      phraseDesReferences([
        { count: 0, ...rdv },
        { count: 0, ...creneau },
      ]),
    ).toBeNull()
  })

  it('accorde le singulier et le pluriel', () => {
    expect(phraseDesReferences([{ count: 1, ...tache }])).toBe('1 tâche')
    expect(phraseDesReferences([{ count: 3, ...tache }])).toBe('3 tâches')
  })

  it('ignore les comptes nuls et enumere le reste', () => {
    expect(
      phraseDesReferences([
        { count: 61, ...rdv },
        { count: 0, ...tache },
        { count: 118, ...creneau },
      ]),
    ).toBe('61 rendez-vous et 118 créneaux modèles')
  })

  it('separe par des virgules au-dela de deux', () => {
    expect(
      phraseDesReferences([
        { count: 2, ...rdv },
        { count: 5, ...creneau },
        { count: 1, ...tache },
      ]),
    ).toBe('2 rendez-vous, 5 créneaux modèles et 1 tâche')
  })
})
