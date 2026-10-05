import { Mailer } from '../../../main/infra/mail/mailer'
import type { IocContainer } from '../../../main/types/application/ioc'

const MAIL = {
  to: 'personne@etab.fr',
  subject: 'Sujet',
  text: 'lien #jeton-secret',
  html: '<a href="#jeton-secret">lien</a>',
}

const build = (sendMail: jest.Mock | null) => {
  const logs: string[] = []
  const log = (message: string) => logs.push(message)
  const mailer = new Mailer({
    mailTransport: sendMail ? { sendMail } : null,
    logger: { debug: log, error: log, info: log, trace: log, warn: log },
    config: { smtpFrom: 'MediSync <no-reply@test>' },
  } as unknown as IocContainer)
  return { mailer, logs }
}

describe('Mailer', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('reessaie apres un echec puis envoie, sans jamais journaliser le contenu', async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(new Error('SMTP down personne@etab.fr'))
      .mockResolvedValueOnce({})
    const { mailer, logs } = build(sendMail)

    mailer.send('invitation', MAIL)
    await jest.advanceTimersByTimeAsync(10_000)

    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail).toHaveBeenLastCalledWith({
      ...MAIL,
      from: 'MediSync <no-reply@test>',
    })
    expect(logs.at(-1)).toBe('Mail invitation envoyé')
    expect(logs.join('\n')).not.toMatch(/jeton|personne@/)
  })

  it('abandonne apres quatre essais', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('down'))
    const { mailer, logs } = build(sendMail)

    mailer.send('invitation', MAIL)
    await jest.advanceTimersByTimeAsync(10 * 60_000)

    expect(sendMail).toHaveBeenCalledTimes(4)
    expect(logs.at(-1)).toBe('Mail invitation abandonné [Error]')
  })

  it('n envoie rien quand le transport est desactive', () => {
    const { mailer, logs } = build(null)

    mailer.send('invitation', MAIL)

    expect(logs).toEqual([
      'Mail invitation non envoyé : envoi désactivé (SMTP_HOST)',
    ])
  })
})
