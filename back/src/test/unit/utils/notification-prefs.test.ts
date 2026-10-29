import {
  allows,
  DEFAULT_PREFS,
  mailAllows,
  normalizePrefs,
  presetMail,
  withLiveServices,
} from '../../../main/utils/notification-prefs'

describe('withLiveServices', () => {
  const avec = (services: string[] | null) => ({ ...DEFAULT_PREFS, services })

  it('liste sans aucun service actuel : vaut tous, la notification part', () => {
    const p = withLiveServices(avec(['parti']), ['s1'])
    expect(p.services).toBeNull()
    expect(allows(p, 'MENTION', 's1')).toBe(true)
  })

  it('liste qui recoupe un service actuel : inchangee, un service decoche reste muet', () => {
    const p = withLiveServices(avec(['s2', 'parti']), ['s1', 's2'])
    expect(p.services).toEqual(['s2', 'parti'])
    expect(allows(p, 'MENTION', 's1')).toBe(false)
    expect(allows(p, 'MENTION', 's2')).toBe(true)
  })

  it('null ou aucun service actuel connu : rien ne change pour null, une liste devient tous', () => {
    expect(withLiveServices(avec(null), ['s1']).services).toBeNull()
    expect(withLiveServices(avec(['s1']), []).services).toBeNull()
  })
})

describe('notification-prefs', () => {
  it('complete des preferences absentes par le defaut', () => {
    expect(normalizePrefs({})).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(DEFAULT_PREFS).toMatchObject({
      level: 'custom',
      services: null,
      reminderDelay: 'eve',
      digest: 'now',
    })
    expect(Object.values(DEFAULT_PREFS.app).every(Boolean)).toBe(true)
    expect(Object.values(DEFAULT_PREFS.mail).some(Boolean)).toBe(false)
  })

  it('garde les cles connues et ignore le reste', () => {
    const p = normalizePrefs({
      level: 'custom',
      app: { absent: false, inconnu: true },
      reminderDelay: '1h',
      services: ['s1'],
    })
    expect(p.level).toBe('custom')
    expect(p.app.absent).toBe(false)
    expect(p.app.added).toBe(true)
    expect(p.reminderDelay).toBe('1h')
    expect(p.services).toEqual(['s1'])
    expect('inconnu' in p.app).toBe(false)
  })

  it('rejette les valeurs invalides au profit du defaut', () => {
    const p = normalizePrefs({
      level: 'tout',
      reminderDelay: '3h',
      services: 'x',
      app: { added: 'oui' },
    })
    expect(p.level).toBe('custom')
    expect(p.reminderDelay).toBe('eve')
    expect(p.services).toBeNull()
    expect(p.app.added).toBe(true)
  })

  it('filtre par type et par service', () => {
    const p = normalizePrefs({ app: { moved: false }, services: ['s1'] })
    expect(allows(p, 'APPOINTMENT_MOVED', 's1')).toBe(false)
    expect(allows(p, 'APPOINTMENT_CANCELLED', 's1')).toBe(false)
    expect(allows(p, 'PATIENT_ADDED', 's1')).toBe(true)
    expect(allows(p, 'PATIENT_ADDED', 's2')).toBe(false)
    expect(allows(DEFAULT_PREFS, 'MENTION', 'nimporte')).toBe(true)
  })

  it('aucun e-mail par defaut, niveau personnalise', () => {
    expect(DEFAULT_PREFS).toMatchObject({ level: 'custom', digest: 'now' })
    expect(Object.values(DEFAULT_PREFS.mail).some(Boolean)).toBe(false)
    expect(Object.values(DEFAULT_PREFS.app).every(Boolean)).toBe(true)
  })

  it('une preference de l etape 2 (sans mail) passe en personnalise sans e-mail', () => {
    const p = normalizePrefs({
      level: 'essential',
      services: null,
      reminderDelay: '1h',
      app: { absent: false },
    })
    expect(p.level).toBe('custom')
    expect(Object.values(p.mail).some(Boolean)).toBe(false)
    expect(p.app.absent).toBe(false)
    expect(p.reminderDelay).toBe('1h')
  })

  it('garde le niveau quand mail est present', () => {
    const p = normalizePrefs({
      level: 'essential',
      mail: presetMail('essential'),
      digest: 'daily',
    })
    expect(p.level).toBe('essential')
    expect(p.digest).toBe('daily')
  })

  it('presets e-mail', () => {
    expect(Object.values(presetMail('all')).every(Boolean)).toBe(true)
    const e = presetMail('essential')
    expect(
      Object.entries(e)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort(),
    ).toEqual(['mention', 'moved', 'reminder'])
  })

  it('mailAllows : case e-mail et services', () => {
    const p = normalizePrefs({
      level: 'custom',
      mail: { ...presetMail('essential') },
      services: ['s1'],
    })
    expect(mailAllows(p, 'REMINDER', 's1')).toBe(true)
    expect(mailAllows(p, 'APPOINTMENT_CANCELLED', 's1')).toBe(true)
    expect(mailAllows(p, 'ABSENT', 's1')).toBe(false)
    expect(mailAllows(p, 'REMINDER', 's2')).toBe(false)
    expect(mailAllows(DEFAULT_PREFS, 'MENTION', 's1')).toBe(false)
  })
})
