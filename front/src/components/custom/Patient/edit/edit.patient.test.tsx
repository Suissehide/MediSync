import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { Patient } from '@/types/patient.ts'

import EditPatient from './edit.patient.tsx'

// `main.tsx` enregistre ce greffon au démarrage de l'application ; les champs `DatePicker` du
// sous-dossier (`entryDate`, `exitDate`) en dépendent via `AdapterDayjs`. Le harnais de test ne
// passe pas par `main.tsx` et doit donc le reproduire (même convention que `navbar.test.tsx`).
dayjs.extend(utc)

// Décision 2.3 de la spec (`docs/superpowers/specs/2026-09-24-multi-tenant-etape-3-dossier-patient-design.md`) :
// la fiche patient sépare visiblement l'identité partagée entre les services (Patient) du
// dossier du service courant (PatientServiceFile). Ces tests verrouillent les deux règles qui
// priment sur tout le reste (task-11-brief.md) : le formulaire du sous-dossier ne s'affiche ni
// ne se soumet si sa lecture a échoué, et il n'envoie jamais que les champs réellement modifiés.

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const patientFixture: Patient = {
  id: 'p1',
  firstName: 'Jean',
  lastName: 'Dupont',
}

const serviceFileFixture = {
  id: 'psf1',
  patientId: 'p1',
  serviceId: 's1',
  establishmentId: 'e1',
  createdAt: '2026-01-01T00:00:00.000Z',
  notes: 'note existante',
  goal: 'objectif existant',
}

type Route = {
  match: (url: string, method: string) => boolean
  respond: (url: string, init?: RequestInit) => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond(url, init)
    return { ...result, url }
  })

const renderEditPatient = (patient: Patient = patientFixture) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
        <EditPatient patient={patient} />
      </LocalizationProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ context })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditPatient — une lecture du sous-dossier en échec (refus d’accès)', () => {
  it("n'affiche pas les champs du sous-dossier, tout en gardant le bloc d'identité partagée", async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: false, status: 403, json: async () => ({}) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    // Le refus d'accès (403) doit remonter comme une vraie erreur affichée — pas comme une
    // absence de sous-dossier (ce dernier cas, la 404, est verrouillé côté hook par
    // `usePatientServiceFile.test.tsx`).
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))

    // Bloc « dossier de ce service » (details.patient.tsx) : absent.
    expect(screen.queryByLabelText('Soignant référent')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    // Bloc « parcours & inclusion » (sous-dossier) : absent.
    expect(screen.queryByLabelText('Diagnostic médical')).not.toBeInTheDocument()
    // Bloc « identité partagée » (identite.patient.tsx, Patient) : toujours présent, sa lecture
    // n'a pas échoué.
    expect(screen.getByLabelText("Distance d'habitation")).toBeInTheDocument()
  })

  it('ne soumet rien du côté du sous-dossier quand on enregistre malgré tout', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: false, status: 403, json: async () => ({}) }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))

    // Seul un champ du patient (identité, pas du sous-dossier) est modifié.
    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(
        true,
      ),
    )

    // Une tentative d'enregistrement a bien eu lieu (le patient), mais rien n'est parti vers le
    // sous-dossier : sa lecture avait échoué.
    const patchCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    expect((patchCalls[0][0] as string).toString()).toMatch(/\/patient\/p1$/)
    // La lecture du sous-dossier a bien été tentée (GET, en échec par le 403 configuré
    // ci-dessus) : c'est le PATCH qui ne doit jamais partir.
    expect(patchCalls.some(([url]) => url.toString().includes('/service-file'))).toBe(false)
  })
})

describe('EditPatient — le sous-dossier envoie une charge partielle', () => {
  it("une modification d'un seul champ n'envoie qu'un champ", async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const notes = await screen.findByLabelText('Notes')
    expect(notes).toHaveValue('note existante')

    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, init]) => url.toString().includes('/service-file') && (init as RequestInit)?.method === 'PATCH'),
      ).toBe(true),
    )

    const serviceFilePatch = fetchMock.mock.calls.find(
      ([url, init]) => url.toString().includes('/service-file') && (init as RequestInit)?.method === 'PATCH',
    )
    expect(serviceFilePatch).toBeDefined()
    const body = JSON.parse((serviceFilePatch?.[1] as RequestInit).body as string)
    expect(body).toEqual({ notes: 'note modifiée' })
  })
})

describe('EditPatient — deux écritures indépendantes, la vérité si l’une échoue', () => {
  it('dit que le patient a échoué sans laisser croire que le dossier de service a échoué aussi', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('mise à jour du patient')),
      ).toBe(true),
    )

    const titles = useToastStore.getState().toasts.map((t) => t.title)
    expect(titles.some((title) => typeof title === 'string' && title.includes('Erreur lors de la mise à jour du patient'))).toBe(
      true,
    )
    // Le dossier de service, lui, a réussi — rien ne doit le faire passer pour un échec global.
    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Dossier de service modifié')),
      ).toBe(true),
    )
  })

  it('dit que le dossier de service a échoué sans laisser croire que le patient a échoué aussi', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((t) => typeof t.title === 'string' && t.title.includes('Erreur lors de la mise à jour du dossier de service')),
      ).toBe(true),
    )

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Patient modifié')),
      ).toBe(true),
    )
  })
})

// Correctif tour 1 (task-11-review.md, C1/C2/I1/I4) — la propriété que ces tests tiennent :
// « le corps envoyé ne contient jamais un champ que l'utilisateur n'a pas touché », à travers
// plusieurs enregistrements, plusieurs relectures, un champ modifié puis rétabli. `FormApi.update`
// (`@tanstack/form-core`) recopie `options.defaultValues` à chaque relecture, mais ne rafraîchit
// `state.values` qu'avant tout premier `touch` — dès qu'un champ est touché, `isDefaultValue`
// (calculé contre `options.defaultValues`) cesse de vouloir dire « non modifié » et se met à
// suivre une cible qui bouge sous ses pieds. C'est cette divergence que `serviceFileSnapshot`
// (`edit.patient.tsx`) ferme : une référence qui ne bouge que deux fois — au premier chargement,
// et après un enregistrement réussi, à partir de ce que le serveur a confirmé.
describe('EditPatient — deux enregistrements successifs, une relecture entre les deux (C1)', () => {
  it('après une création sur sous-dossier absent (404), le second enregistrement ne renvoie que le champ touché à ce tour-ci', async () => {
    let created: Record<string, unknown> | null = null
    const bodies: Record<string, unknown>[] = []

    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () =>
          created
            ? { ok: true, status: 200, json: async () => created }
            : { ok: false, status: 404, json: async () => ({}) },
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: (_url, init) => {
          const body = JSON.parse((init?.body as string) ?? '{}')
          bodies.push(body)
          created = {
            id: 'psf1',
            patientId: 'p1',
            serviceId: 's1',
            establishmentId: 'e1',
            createdAt: '2026-01-01T00:00:00.000Z',
            ...created,
            ...body,
          }
          return { ok: true, status: 200, json: async () => created }
        },
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'premiere note')
    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ notes: 'premiere note' })

    // La relecture déclenchée par `onSettled` ramène l'objet créé, avec les quinze autres
    // colonnes à `null` — c'est exactement la séquence de C1. La barre s'est refermée (I1) : le
    // bouton précédent est démonté, il en faut un nouveau.
    await waitFor(() => expect(created).not.toBeNull())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Sauvegarder/i })).not.toBeInTheDocument(),
    )

    const referringCaregiver = await screen.findByLabelText('Soignant référent')
    await userEvent.clear(referringCaregiver)
    await userEvent.type(referringCaregiver, 'Dr Y')
    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() => expect(bodies).toHaveLength(2))
    // La propriété : ce corps ne porte que le champ que le soignant vient de saisir — jamais les
    // quatorze autres, jamais à la chaîne vide.
    expect(bodies[1]).toEqual({ referringCaregiver: 'Dr Y' })
  })
})

describe('EditPatient — une relecture pose une valeur ailleurs entre deux enregistrements (C2)', () => {
  it("n'écrase pas ce qu'un enregistrement suivant, non lié au champ édité, a posé sur le sous-dossier", async () => {
    let server: Record<string, unknown> = { ...serviceFileFixture }
    const bodies: Record<string, unknown>[] = []
    let firstSaveDone = false

    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => {
          if (firstSaveDone) {
            // Simule une écriture concurrente : un objectif posé ailleurs, révélé par la
            // relecture que déclenche notre propre `onSettled`.
            server = { ...server, goal: 'objectif pose ailleurs', referringCaregiver: 'Dr Z' }
          }
          return { ok: true, status: 200, json: async () => server }
        },
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: (_url, init) => {
          const body = JSON.parse((init?.body as string) ?? '{}')
          bodies.push(body)
          server = { ...server, ...body }
          firstSaveDone = true
          return { ok: true, status: 200, json: async () => server }
        },
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note 1')
    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ notes: 'note 1' })

    await waitFor(() => expect(server.goal).toBe('objectif pose ailleurs'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Sauvegarder/i })).not.toBeInTheDocument(),
    )

    const notesAgain = await screen.findByLabelText('Notes')
    await userEvent.clear(notesAgain)
    await userEvent.type(notesAgain, 'note 1 bis')
    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() => expect(bodies).toHaveLength(2))
    // La propriété : le second corps ne porte que `notes`, jamais `goal`/`referringCaregiver` —
    // qui n'ont jamais été touchés dans ce formulaire.
    expect(bodies[1]).toEqual({ notes: 'note 1 bis' })
    // Et ce que la lecture avait révélé entre les deux enregistrements tient toujours côté
    // serveur : rien ne l'a écrasé.
    expect(server.goal).toBe('objectif pose ailleurs')
    expect(server.referringCaregiver).toBe('Dr Z')
  })
})

describe('EditPatient — une relecture en arrière-plan, étrangère à notre propre enregistrement', () => {
  it("n'introduit pas de champ non touché dans le prochain corps envoyé", async () => {
    let server: Record<string, unknown> = { ...serviceFileFixture }
    const bodies: Record<string, unknown>[] = []
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })

    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => server }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: (_url, init) => {
          const body = JSON.parse((init?.body as string) ?? '{}')
          bodies.push(body)
          server = { ...server, ...body }
          return { ok: true, status: 200, json: async () => server }
        },
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={queryClient}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
          <EditPatient patient={patientFixture} />
        </LocalizationProvider>
      </QueryClientProvider>,
    )

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note en cours')

    // Une relecture qui ne vient PAS de notre propre `onSettled` (pas d'enregistrement en jeu ici
    // — une invalidation quelconque ailleurs dans l'application, un focus de fenêtre...) : entre
    // temps, `goal` a changé côté serveur.
    server = { ...server, goal: 'objectif change ailleurs' }
    await queryClient.invalidateQueries({ queryKey: ['get_patient_service_file', 'p1'] })

    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ notes: 'note en cours' })
  })
})

describe('EditPatient — un champ touché puis remis à sa valeur d’origine', () => {
  it('ne part dans aucun PATCH', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: (_url, init) => {
          bodies.push(JSON.parse((init?.body as string) ?? '{}'))
          return { ok: true, status: 200, json: async () => serviceFileFixture }
        },
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const notes = await screen.findByLabelText('Notes')
    expect(notes).toHaveValue('note existante')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'brouillon')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note existante')

    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    // Rien à attendre côté écran (aucun toast, aucun changement visible) : on laisse le temps à
    // un éventuel PATCH indu de partir avant de conclure.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toHaveLength(0)
  })
})

describe('EditPatient — rien à écrire côté sous-dossier', () => {
  it('ne PATCH pas le sous-dossier et ne montre pas son toast de succès', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: (_url, init) => {
          bodies.push(JSON.parse((init?.body as string) ?? '{}'))
          return { ok: true, status: 200, json: async () => serviceFileFixture }
        },
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => ({ ...patientFixture, firstName: 'Jeanne' }) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Patient modifié')),
      ).toBe(true),
    )
    expect(bodies).toHaveLength(0)
    expect(
      useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Dossier de service')),
    ).toBe(false)
  })
})

describe('EditPatient — la barre « Modifications non sauvegardées » (I1)', () => {
  it('se referme après un enregistrement réussi', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => ({ ...patientFixture, firstName: 'Jeanne' }) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    expect(screen.queryByText('Modifications non sauvegardées')).not.toBeInTheDocument()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    await waitFor(() =>
      expect(screen.queryByText('Modifications non sauvegardées')).toBeInTheDocument(),
    )

    await userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/i }))

    await waitFor(() =>
      expect(screen.queryByText('Modifications non sauvegardées')).not.toBeInTheDocument(),
    )
  })
})

// Décision 2.3 de la spec, correctif I2 (task-11-review.md) : chaque écran qui affiche des champs
// de `Patient` ou de `PatientServiceFile` doit dire à quelle portée ils appartiennent — pas
// seulement l'onglet « Profil & Contexte ».
describe('EditPatient — la portée est nommée sur les trois onglets qui en manquaient (I2)', () => {
  it('« Informations générales » et « Contact » disent qu’ils sont partagés entre les services', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        {
          match: (url, method) => url.includes('/service-file') && method === 'GET',
          respond: () => ({ ok: false, status: 404, json: async () => ({}) }),
        },
      ]),
    )

    renderEditPatient()

    expect(
      await screen.findByText(/Informations générales — partagées entre les services/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Contact — partagé entre les services/),
    ).toBeInTheDocument()
  })

  it('« Parcours et inclusion » et « Sortie et bilan » disent qu’ils sont propres au service', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        {
          match: (url, method) => url.includes('/service-file') && method === 'GET',
          respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
        },
      ]),
    )

    renderEditPatient()

    expect(
      await screen.findByText(/Parcours et inclusion — dossier de ce service, non visible/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Sortie et bilan — dossier de ce service, non visible/),
    ).toBeInTheDocument()
  })
})
