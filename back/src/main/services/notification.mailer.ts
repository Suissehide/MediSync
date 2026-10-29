import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

import {
  digestMail,
  type MailableNotification,
  notificationMail,
} from '../infra/mail/notification-templates'
import type { IocContainer } from '../types/application/ioc'
import type { NotificationMailerInterface } from '../types/domain/notification-mailer.interface'
import type { MailerInterface } from '../types/infra/mail/mailer.interface'
import type {
  NotificationMailRepositoryInterface,
  PendingNotificationRow,
  RecipientRow,
} from '../types/infra/orm/repositories/notification-mail.repository.interface'
import type { Logger } from '../types/utils/logger'
import { mailAllows } from '../utils/notification-prefs'

dayjs.extend(timezone)
dayjs.extend(utc)

const PARIS = 'Europe/Paris'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 07:00 Paris du jour calendaire de `now`, instant reel (pas une heure murale brute).
const todaySevenAM = (now: Date): Date =>
  dayjs.tz(`${dayjs(now).tz(PARIS).format('YYYY-MM-DD')} 07:00`, PARIS).toDate()

// Envoi des notifications par e-mail et resume quotidien des preferences `daily` — seul point d'envoi.
class NotificationMailer implements NotificationMailerInterface {
  private readonly notificationMailRepository: NotificationMailRepositoryInterface
  private readonly mailer: MailerInterface
  private readonly frontUrl: string
  private readonly logger: Logger

  constructor({
    notificationMailRepository,
    mailer,
    config,
    logger,
  }: IocContainer) {
    this.notificationMailRepository = notificationMailRepository
    this.mailer = mailer
    this.frontUrl = config.frontUrl
    this.logger = logger
  }

  async runOnce(
    now: Date,
  ): Promise<{ sent: number; skipped: number; digests: number }> {
    const since = new Date(now.getTime() - THIRTY_DAYS_MS)
    await this.notificationMailRepository.expireOlderThan(since)
    const pending = await this.notificationMailRepository.pending(since)
    if (pending.length === 0) {
      return { sent: 0, skipped: 0, digests: 0 }
    }

    const recipients = await this.notificationMailRepository.recipients([
      ...new Set(pending.map((n) => n.userId)),
    ])
    const names = await this.#authorNames(pending)
    const { toSkip, immediate, daily } = this.#classify(pending, recipients)

    let skipped = 0
    if (toSkip.length > 0) {
      await this.notificationMailRepository.mark(toSkip, 'SKIPPED')
      skipped += toSkip.length
    }

    const sentNow = await this.#sendImmediate(immediate, recipients, names)
    const digest =
      dayjs(now).tz(PARIS).hour() >= 7
        ? await this.#sendDigests(daily, now, recipients, names)
        : { sent: 0, skipped: 0, digests: 0 }

    return {
      sent: sentNow + digest.sent,
      skipped: skipped + digest.skipped,
      digests: digest.digests,
    }
  }

  // Desactive ou preference fermee -> SKIPPED ; sinon immediat (digest 'now' ou REMINDER) ou en attente du resume.
  #classify(
    pending: PendingNotificationRow[],
    recipients: Map<string, RecipientRow>,
  ): {
    toSkip: string[]
    immediate: PendingNotificationRow[]
    daily: PendingNotificationRow[]
  } {
    const toSkip: string[] = []
    const immediate: PendingNotificationRow[] = []
    const daily: PendingNotificationRow[] = []
    for (const n of pending) {
      const r = recipients.get(n.userId)
      if (!r || r.deactivatedAt || !mailAllows(r.prefs, n.type, n.serviceId)) {
        toSkip.push(n.id)
      } else if (r.prefs.digest === 'now' || n.type === 'REMINDER') {
        immediate.push(n)
      } else {
        daily.push(n)
      }
    }
    return { toSkip, immediate, daily }
  }

  // Capture (PENDING -> SENT) avant l'envoi : sous deux `runOnce` concurrents, un seul gagne
  // chaque id et envoie ; un echec du mailer apres capture n'est jamais rejoue.
  async #sendImmediate(
    immediate: PendingNotificationRow[],
    recipients: Map<string, RecipientRow>,
    names: Map<string, string>,
  ): Promise<number> {
    if (immediate.length === 0) {
      return 0
    }
    const claimed = new Set(
      await this.notificationMailRepository.claim(immediate.map((n) => n.id)),
    )
    let sent = 0
    for (const n of immediate) {
      if (!claimed.has(n.id)) {
        continue
      }
      const recipient = recipients.get(n.userId) as RecipientRow
      try {
        this.mailer.send(
          'notification',
          notificationMail(
            recipient.email,
            this.#mailable(n, names),
            this.frontUrl,
          ),
        )
        sent += 1
      } catch (err) {
        this.#logError('envoi immediat', err)
      }
    }
    return sent
  }

  // Resume : par destinataire, les notifications daily creees avant 7h Paris aujourd'hui ; lues -> SKIPPED, le reste capture puis un seul e-mail (rien capture -> aucun envoi).
  async #sendDigests(
    daily: PendingNotificationRow[],
    now: Date,
    recipients: Map<string, RecipientRow>,
    names: Map<string, string>,
  ): Promise<{ sent: number; skipped: number; digests: number }> {
    const threshold = todaySevenAM(now)
    const byUser = new Map<string, PendingNotificationRow[]>()
    for (const n of daily) {
      if (n.createdAt >= threshold) {
        continue
      }
      byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n])
    }

    let sent = 0
    let skipped = 0
    let digests = 0
    for (const [userId, items] of byUser) {
      try {
        const read = items.filter((i) => i.readAt !== null)
        const unread = items.filter((i) => i.readAt === null)
        if (read.length > 0) {
          await this.notificationMailRepository.mark(
            read.map((i) => i.id),
            'SKIPPED',
          )
          skipped += read.length
        }
        if (unread.length === 0) {
          continue
        }
        const claimed = new Set(
          await this.notificationMailRepository.claim(unread.map((i) => i.id)),
        )
        const toSend = unread.filter((i) => claimed.has(i.id))
        if (toSend.length === 0) {
          continue
        }
        const recipient = recipients.get(userId) as RecipientRow
        this.mailer.send(
          'notification-digest',
          digestMail(
            recipient.email,
            toSend.map((n) => this.#mailable(n, names)),
            now,
            this.frontUrl,
          ),
        )
        sent += toSend.length
        digests += 1
      } catch (err) {
        this.#logError('resume', err)
      }
    }
    return { sent, skipped, digests }
  }

  // MENTION lit `payload.actorName` (prenom nom de l'auteur), jamais le texte libre de la tache.
  #mailable(
    n: PendingNotificationRow,
    names: Map<string, string>,
  ): MailableNotification {
    if (n.type !== 'MENTION') {
      return { type: n.type, payload: n.payload }
    }
    const authorId = n.payload.authorId
    const actorName =
      typeof authorId === 'string' ? names.get(authorId) : undefined
    return { type: n.type, payload: { ...n.payload, actorName } }
  }

  #authorNames(
    pending: PendingNotificationRow[],
  ): Promise<Map<string, string>> {
    const authorIds = [
      ...new Set(
        pending
          .filter((n) => n.type === 'MENTION')
          .map((n) => n.payload.authorId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]
    return this.notificationMailRepository.names(authorIds)
  }

  // Jamais la valeur brute de l'erreur, meme regle que les autres taches planifiees.
  #logError(step: string, err: unknown): void {
    const errorClass = err instanceof Error ? err.constructor.name : typeof err
    this.logger.error(`NotificationMailer ${step} failed [${errorClass}]`)
  }
}

export { NotificationMailer }
