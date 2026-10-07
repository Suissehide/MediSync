import { ACTIVITY_DEFINITIONS, JOURS } from '../constants/activity.constant.ts'
import { STOP_REASON } from '../constants/patient.constant.ts'
import type { ActivityReport } from '../types/activity.ts'

export const pourcent = (rate: number | null): string =>
  rate === null ? '—' : `${Math.round(rate * 100)} %`

const nombre = (n: number): string => String(n).replace('.', ',')

// Une décimale, comme l'écran (`activite.tsx`) : les deux doivent toujours s'accorder.
export const heures = (h: number): string => nombre(Math.round(h * 10) / 10)

// Neutralise l'injection de formule tableur : un libellé saisi par un soignant (thématique,
// parcours, motif) qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est
// préfixé d'une apostrophe avant d'être cité — Excel/LibreOffice le lisent alors comme du texte.
const neutralise = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

const champ = (v: string): string =>
  /[;"\r\n]/.test(v) ? `"${v.split('"').join('""')}"` : v

const definition = (label: string): string =>
  ACTIVITY_DEFINITIONS.find((d) => d.label === label)?.definition ?? ''

// BOM et point-virgule : Excel en français ouvre le fichier sans assistant d'import.
export const activityCsv = (r: ActivityReport, serviceName: string): string => {
  const lignes: string[][] = [
    ['section', 'libellé', 'valeur', 'définition'],
    ['Service', serviceName, '', ''],
    ['Période', `${r.from} au ${r.to}`, '', ''],
    [
      'Patients',
      'File active',
      nombre(r.patients.active),
      definition('File active'),
    ],
    [
      'Patients',
      'Nouveaux inclus',
      nombre(r.patients.newlyIncluded),
      definition('Nouveaux inclus'),
    ],
    ['Patients', 'Sortis', nombre(r.patients.exited), definition('Sortis')],
    [
      'Parcours',
      'Ont terminé',
      nombre(r.completion.completed),
      definition('Ont terminé'),
    ],
    [
      'Parcours',
      'Taux de complétion',
      pourcent(r.completion.rate),
      definition('Taux de complétion'),
    ],
    [
      'Parcours',
      'Abandons',
      nombre(r.completion.dropouts),
      definition('Abandons'),
    ],
    ...r.completion.dropoutReasons.map((m) => [
      "Motifs d'arrêt",
      STOP_REASON[m.reason as keyof typeof STOP_REASON] ?? m.reason,
      nombre(m.count),
      '',
    ]),
    [
      'Absences',
      'Ensemble',
      pourcent(r.absences.overall.rate),
      definition('Absentéisme'),
    ],
    ...r.absences.byThematic.flatMap((t) => [
      [
        'Absences par thématique',
        t.thematic,
        pourcent(t.total.rate),
        `${t.total.absent} sur ${t.total.pointed}`,
      ],
      ...t.cells.flatMap((c, d) =>
        c.pointed > 0
          ? [
              [
                'Absences par thématique et jour',
                `${t.thematic} — ${JOURS[d]}`,
                pourcent(c.rate),
                `${c.absent} sur ${c.pointed}`,
              ],
            ]
          : [],
      ),
    ]),
    ...r.absences.byPathway.map((p) => [
      'Absences par parcours',
      p.pathway,
      pourcent(p.cell.rate),
      `${p.cell.absent} sur ${p.cell.pointed}`,
    ]),
    [
      'Séances',
      'Individuelles',
      nombre(r.sessions.individual),
      definition('Séances individuelles'),
    ],
    [
      'Séances',
      'Collectives',
      nombre(r.sessions.collective),
      definition('Séances collectives'),
    ],
    [
      'Séances',
      'Diagnostics éducatifs',
      nombre(r.sessions.educationalDiagnoses),
      definition('Diagnostics éducatifs réalisés'),
    ],
    [
      'Séances',
      'Bilans de fin',
      nombre(r.sessions.finalReviews),
      definition('Bilans de fin'),
    ],
    ...r.hoursBySoignant.map((h) => [
      'Heures soignant',
      h.soignant,
      heures(h.hours),
      definition('Heures soignant'),
    ]),
  ]
  return `﻿${lignes
    .map((l) => [l[0], neutralise(l[1]), l[2], l[3]].map(champ).join(';'))
    .join('\r\n')}\r\n`
}
