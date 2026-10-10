import { describe, expect, it } from 'vitest'

import { arsCsv } from './arsCsv.ts'

const csv = arsCsv(
  [
    {
      code: '1.1',
      group: 'Entrée',
      label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
      value: 7,
      note: null,
      kind: 'computed',
      input: null,
      answer: null,
    },
    {
      code: '2.3',
      group: 'Séances',
      label: 'Nombre de patients pris en charge en soins de ville uniquement',
      value: null,
      note: 'Aucune notion de soins de ville',
      kind: 'unavailable',
      input: null,
      answer: null,
    },
    {
      code: '2.5',
      group: 'Séances',
      label: 'Autre type de prise en charge à chiffrer et à expliquer',
      value: null,
      note: "Champ libre de l'enquête, à renseigner à la main",
      kind: 'manual',
      input: 'number+text',
      answer: {
        numberValue: 12,
        textValue: 'Ateliers en ville',
        boolValue: null,
      },
    },
    {
      code: '4.2',
      group: 'Modalités',
      label: 'Une offre de suivi est-elle proposée ?',
      value: null,
      note: 'Question oui/non sur la structure, à renseigner à la main',
      kind: 'manual',
      input: 'yesno',
      answer: { numberValue: null, textValue: null, boolValue: true },
    },
    {
      code: '4.3',
      group: 'Modalités',
      label: 'Question sans reponse',
      value: null,
      note: 'A renseigner',
      kind: 'manual',
      input: 'yesno',
      answer: null,
    },
  ],
  '=Cardio',
  '2026-01-01',
  '2026-12-31',
)

describe('arsCsv', () => {
  it('ouvre sur l en-tete, le service neutralise et la periode', () => {
    expect(csv.split('\r\n').slice(0, 3)).toEqual([
      '﻿code;libellé;valeur;note',
      "Service;'=Cardio;;",
      'Période;2026-01-01 au 2026-12-31;;',
    ])
  })

  it('ecrit la valeur, ou la raison quand il n y en a pas', () => {
    expect(csv).toContain(
      "1.1;Nombre de patients ayant bénéficié d'un diagnostic éducatif;7;\r\n",
    )
    expect(csv).toContain(
      '2.3;Nombre de patients pris en charge en soins de ville uniquement;;Aucune notion de soins de ville\r\n',
    )
  })

  it('reprend les reponses saisies a la main', () => {
    expect(csv).toContain(
      '2.5;Autre type de prise en charge à chiffrer et à expliquer;12;Ateliers en ville\r\n',
    )
    expect(csv).toContain('4.2;Une offre de suivi est-elle proposée ?;Oui;')
    expect(csv).toContain('4.3;Question sans reponse;;A renseigner')
  })
})
