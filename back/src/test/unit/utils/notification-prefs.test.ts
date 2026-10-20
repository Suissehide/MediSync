import {
  allows,
  DEFAULT_PREFS,
  normalizePrefs,
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
      level: 'essential',
      services: null,
      reminderDelay: 'eve',
    })
    expect(Object.values(DEFAULT_PREFS.app).every(Boolean)).toBe(true)
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
    expect(p.level).toBe('essential')
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
})
