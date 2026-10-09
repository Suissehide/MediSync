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
    },
    {
      code: '2.3',
      group: 'Séances',
      label: 'Nombre de patients pris en charge en soins de ville uniquement',
      value: null,
      note: 'Aucune notion de soins de ville',
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
})
