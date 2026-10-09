import { describe, expect, it } from 'vitest'

import { nombre, slugify, toCsv } from './csv.ts'

describe('toCsv', () => {
  it('commence par le BOM et separe par des points-virgules', () => {
    expect(toCsv([['a', 'b']], [])).toBe('﻿a;b\r\n')
  })

  it('cite un champ qui contient le separateur ou un guillemet', () => {
    expect(toCsv([['a;b', 'dit "oui"']], [])).toBe('﻿"a;b";"dit ""oui"""\r\n')
  })

  it('neutralise une formule dans les seules colonnes libres', () => {
    expect(toCsv([['=SUM(A1)', '-3']], [0])).toBe("﻿'=SUM(A1);-3\r\n")
  })
})

describe('nombre et slugify', () => {
  it('ecrit la virgule decimale a la francaise', () => {
    expect(nombre(120.5)).toBe('120,5')
  })

  it('reduit un nom de service a un segment de fichier', () => {
    expect(slugify('Réadaptation Cardiaque — HDJ')).toBe(
      'readaptation-cardiaque-hdj',
    )
    expect(slugify('***')).toBe('service')
  })
})
