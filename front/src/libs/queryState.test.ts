import { describe, expect, it } from 'vitest'

import { queryState } from './queryState.ts'

// Tour de correction 1, Important n°4 : « une erreur de chargement donne un
// "Chargement…" perpétuel ». Avec `retry: 0`, une requête en échec retombe
// `isPending: false` sans jamais poser `establishment` — une condition qui
// ne teste que `isPending || !establishment` reste donc vraie pour
// toujours. `queryState` nomme les quatre situations distinctement, pour
// qu'aucun appelant ne puisse les confondre par accident.
describe('queryState', () => {
  it('est "pending" tant que la requete est en cours, meme si une erreur precedente traine', () => {
    expect(
      queryState({
        isPending: true,
        error: new Error('ancienne'),
        hasData: false,
      }),
    ).toBe('pending')
  })

  it('est "error" quand la requete a echoue et ne repart pas — le cas exact du defaut corrige', () => {
    expect(
      queryState({ isPending: false, error: new Error('404'), hasData: false }),
    ).toBe('error')
  })

  it('est "empty" sur un succes sans aucune donnee', () => {
    expect(queryState({ isPending: false, error: null, hasData: false })).toBe(
      'empty',
    )
  })

  it('est "ready" sur un succes avec donnee', () => {
    expect(queryState({ isPending: false, error: null, hasData: true })).toBe(
      'ready',
    )
  })
})
