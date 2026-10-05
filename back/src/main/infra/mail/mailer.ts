import type { IocContainer } from '../../types/application/ioc'
import type {
  Mail,
  MailerInterface,
  MailTransport,
} from '../../types/infra/mail/mailer.interface'
import type { Logger } from '../../types/utils/logger'

// Délais avant chaque nouvelle tentative : 4 essais en tout, sur ~6 minutes.
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000]

// ponytail: file en mémoire, perdue au redémarrage — l'admin peut toujours copier le lien ;
// passer à une table d'envoi si les convocations patients (MDS-24) l'exigent.
class Mailer implements MailerInterface {
  private readonly mailTransport: MailTransport | null
  private readonly logger: Logger
  private readonly from: string

  constructor({ mailTransport, logger, config }: IocContainer) {
    this.mailTransport = mailTransport
    this.logger = logger
    this.from = config.smtpFrom
  }

  send(kind: string, mail: Mail): void {
    if (!this.mailTransport) {
      this.logger.info(`Mail ${kind} non envoyé : envoi désactivé (SMTP_HOST)`)
      return
    }
    void this.attempt(this.mailTransport, kind, mail, 0)
  }

  private async attempt(
    transport: MailTransport,
    kind: string,
    mail: Mail,
    retry: number,
  ): Promise<void> {
    try {
      await transport.sendMail({ ...mail, from: this.from })
      this.logger.info(`Mail ${kind} envoyé`)
    } catch (err) {
      // Seule la classe de l'erreur : un message SMTP peut citer l'adresse ou le corps.
      const errorClass =
        err instanceof Error ? err.constructor.name : typeof err
      const delay = RETRY_DELAYS_MS[retry]
      if (delay === undefined) {
        this.logger.error(`Mail ${kind} abandonné [${errorClass}]`)
        return
      }
      this.logger.warn(`Mail ${kind} en échec [${errorClass}], nouvel essai`)
      setTimeout(() => {
        void this.attempt(transport, kind, mail, retry + 1)
      }, delay).unref()
    }
  }
}

export { Mailer }
