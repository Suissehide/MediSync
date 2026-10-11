import { describe, expect, it } from 'vitest'

import type { IndicatorResult } from '../types/indicatorSet.ts'
import { indicatorCsv } from './indicatorCsv.ts'

// Champs propres au jeu, sans effet sur le CSV sauf la répartition.
const base = { breakdown: null, parentId: null, warnings: [] }

const csv = indicatorCsv(
  [
    {
      ...base,
      id: 'i1.1',
      code: '1.1',
      group: 'Entrée',
      label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
      value: 7,
      note: null,
      nature: 'computed',
      input: null,
      answer: null,
    },
    {
      ...base,
      id: 'i2.3',
      code: '2.3',
      group: 'Séances',
      label: 'Nombre de patients pris en charge en soins de ville uniquement',
      value: null,
      note: 'Aucune notion de soins de ville',
      nature: 'unavailable',
      input: null,
      answer: null,
    },
    {
      ...base,
      id: 'i2.5',
      code: '2.5',
      group: 'Séances',
      label: 'Autre type de prise en charge à chiffrer et à expliquer',
      value: null,
      note: "Champ libre de l'enquête, à renseigner à la main",
      nature: 'manual',
      input: 'number+text',
      answer: {
        numberValue: 12,
        textValue: 'Ateliers en ville',
        boolValue: null,
      },
    },
    {
      ...base,
      id: 'i4.2',
      code: '4.2',
      group: 'Modalités',
      label: 'Une offre de suivi est-elle proposée ?',
      value: null,
      note: 'Question oui/non sur la structure, à renseigner à la main',
      nature: 'manual',
      input: 'yesno',
      answer: { numberValue: null, textValue: null, boolValue: true },
    },
    {
      ...base,
      id: 'i4.3',
      code: '4.3',
      group: 'Modalités',
      label: 'Question sans reponse',
      value: null,
      note: 'A renseigner',
      nature: 'manual',
      input: 'yesno',
      answer: null,
    },
  ],
  '=Cardio',
  '2026-01-01',
  '2026-12-31',
)

describe('indicatorCsv', () => {
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
    expect(csv).toContain('4.2;Une offre de suivi est-elle proposée ?;Oui;\r\n')
    expect(csv).toContain('4.3;Question sans reponse;;A renseigner')
  })

  it('laisse la note vide pour un 2.5 saisi sans explication', () => {
    const sansTexte = indicatorCsv(
      [
        {
          ...base,
          id: 'i2.5',
          code: '2.5',
          group: 'Séances',
          label: 'Autre',
          value: null,
          note: 'A renseigner',
          nature: 'manual',
          input: 'number+text',
          answer: { numberValue: 3, textValue: null, boolValue: null },
        },
      ],
      'Cardio',
      '2026-01-01',
      '2026-12-31',
    )
    expect(sansTexte).toContain('2.5;Autre;3;\r\n')
  })

  it('retombe sur la note quand la reponse enregistree est vide', () => {
    const vide = indicatorCsv(
      [
        {
          ...base,
          id: 'i2.5',
          code: '2.5',
          group: 'Séances',
          label: 'Autre',
          value: null,
          note: "Champ libre de l'enquête, à renseigner à la main",
          nature: 'manual',
          input: 'number+text',
          answer: { numberValue: null, textValue: null, boolValue: null },
        },
        {
          ...base,
          id: 'i4.2',
          code: '4.2',
          group: 'Modalités',
          label: 'Une offre de suivi est-elle proposée ?',
          value: null,
          note: 'Question oui/non sur la structure, à renseigner à la main',
          nature: 'manual',
          input: 'yesno',
          answer: { numberValue: null, textValue: null, boolValue: null },
        },
      ],
      'Cardio',
      '2026-01-01',
      '2026-12-31',
    )
    expect(vide).toContain(
      "2.5;Autre;;Champ libre de l'enquête, à renseigner à la main\r\n",
    )
    expect(vide).toContain(
      'Question oui/non sur la structure, à renseigner à la main',
    )
  })

  it('ecrit la repartition sur des lignes supplementaires', () => {
    const indicateur: IndicatorResult = {
      ...base,
      id: 'i1.2',
      code: '1.2',
      group: 'Entrée',
      label: 'Patients entrés',
      value: 5,
      note: null,
      nature: 'computed',
      input: null,
      answer: null,
      breakdown: [
        { key: 'HTA', label: 'Hypertension', value: 3 },
        { key: '__empty__', label: 'Non renseigné', value: 2 },
      ],
    }
    expect(
      indicatorCsv([indicateur], 'Cardio', '2026-01-01', '2026-12-31'),
    ).toContain(
      '1.2;Patients entrés;5;\r\n;— Hypertension;3;\r\n;— Non renseigné;2;',
    )
  })
})
