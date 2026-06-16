export const LOCATIONS: string[] = [
  'Bureau 1',
  'Bureau 5',
  'Bureau 6',
  'Bureau 7',
  'Bureau 2 Est',
  'Bureau médical 1',
  'Bureau médical 2',
  'Salle enseignement',
  'Salle visio sous-sol',
  'Cuisine thérapeutique',
  'Salle réadaptation 1',
  'Salle réadaptation 2',
  'Salle méditation',
  'Salle réunion 1 (étage 2)',
  'Salle réunion 2 (étage 2)',
  'SMR',
]

/**
 * Maps the raw location strings historically used in pathway seed data to
 * canonical Location names. Keeps backward compatibility while letting us
 * normalize the underlying data.
 */
export const LOCATION_ALIAS: Record<string, string> = {
  Cuisine: 'Cuisine thérapeutique',
  '2 Est': 'Bureau 2 Est',
  '2Est': 'Bureau 2 Est',
  'bureau 7': 'Bureau 7',
  'ambulatoire Bureau 6': 'Bureau 6',
  'IDE Educ1 ens': 'Salle enseignement',
}

export function resolveLocationName(raw?: string | null): string | null {
  if (!raw) return null
  return LOCATION_ALIAS[raw] ?? raw
}
