import { DateCalendar } from '@mui/x-date-pickers'
import dayjs from 'dayjs'
import { Calendar, User, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  type InboxService,
  useInboxMutations,
  useServiceMembers,
  useServicePatients,
  useServiceSoignants,
} from '@/queries/useInbox.ts'
import { memberName, soignantName } from './inbox.utils.ts'
import {
  type MentionCandidate,
  mentionCandidates,
  mentionQuery,
  stripMention,
} from './mention.ts'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function TaskComposer({
  service,
  onCreated,
  onSubPopupOpenChange,
}: {
  service: InboxService
  onCreated: (taskId: string) => void
  // Mention ouverte OU ligne Échéance ouverte : dans les deux cas Echap ne doit fermer que ce
  // sous-popup, pas tout le panneau Taches (voir inbox.tsx).
  onSubPopupOpenChange?: (open: boolean) => void
}) {
  const members = useServiceMembers(service)
  const soignants = useServiceSoignants(service)
  const { createTask } = useInboxMutations()
  const [draft, setDraft] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [soignantTags, setSoignantTags] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [dateOpen, setDateOpen] = useState(false)
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(
    null,
  )
  const [patientSearch, setPatientSearch] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const patients = useServicePatients(service, patientSearch !== null)

  const query = mentionQuery(draft)
  const candidates =
    query === null
      ? []
      : mentionCandidates(members, soignants, query, tags, soignantTags)
  const mentionOpen = candidates.length > 0
  const subPopupOpen = mentionOpen || dateOpen
  // Remonte l'ouverture au Popover des Taches, pour qu'Echap ne ferme QUE la liste/la ligne Échéance.
  useEffect(() => {
    onSubPopupOpenChange?.(subPopupOpen)
  }, [subPopupOpen, onSubPopupOpenChange])
  useEffect(() => () => onSubPopupOpenChange?.(false), [onSubPopupOpenChange])
  const pick = (candidate: MentionCandidate) => {
    if (candidate.kind === 'soignant') {
      setSoignantTags([...soignantTags, candidate.soignant.id])
    } else {
      setTags([...tags, candidate.member.user.id])
    }
    setDraft(stripMention(draft))
    setActive(0)
  }
  // Le texte envoye est le brouillon tel quel : un `@...` non resolu n'est jamais tronque.
  const text = draft.trim()
  const submit = () => {
    if (!text) {
      return
    }
    createTask.mutate(
      {
        service,
        input: {
          text,
          assigneeIds: tags,
          soignantIds: soignantTags,
          ...(patient ? { patientId: patient.id } : {}),
          ...(dueDate ? { dueDate } : {}),
        },
      },
      {
        onSuccess: (task) => {
          setDraft('')
          setTags([])
          setSoignantTags([])
          setDueDate('')
          setPatient(null)
          onCreated(task.id)
        },
      },
    )
  }
  // Isole des touches de la liste de mention pour alleger la complexite cognitive des deux.
  const onCandidateKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    list: MentionCandidate[],
  ): boolean => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((active + 1) % list.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((active - 1 + list.length) % list.length)
      return true
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const c = list[active] ?? list[0]
      if (c) {
        pick(c)
      }
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(stripMention(draft))
      return true
    }
    return false
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionOpen && onCandidateKey(e, candidates)) {
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }
  const chip = (key: string, label: string, onRemove: () => void) => (
    <span
      key={key}
      className="flex items-center gap-1 pl-2 pr-1 rounded-full bg-blue-50 text-primary text-xs font-medium"
    >
      {label}
      <button
        type="button"
        aria-label={`Retirer ${label}`}
        onClick={onRemove}
        className="cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
  const matchingPatients = patients
    .filter((p) =>
      fold(`${p.lastName} ${p.firstName}`).includes(fold(patientSearch ?? '')),
    )
    .slice(0, 6)
  const toggleDate = () => {
    setPatientSearch(null)
    setDateOpen(!dateOpen)
  }
  const togglePatient = () => {
    setDateOpen(false)
    setPatientSearch(patientSearch === null ? '' : null)
  }

  return (
    <div className="px-[18px] py-3 border-b border-border relative">
      {(tags.length > 0 || soignantTags.length > 0 || patient || dueDate) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((id) =>
            chip(id, `@${memberName(members, id)}`, () =>
              setTags(tags.filter((x) => x !== id)),
            ),
          )}
          {soignantTags.map((id) =>
            chip(`soi-${id}`, `@${soignantName(soignants, id)}`, () =>
              setSoignantTags(soignantTags.filter((x) => x !== id)),
            ),
          )}
          {patient && chip('patient', patient.label, () => setPatient(null))}
          {dueDate &&
            chip(
              'due',
              new Date(`${dueDate}T00:00:00`).toLocaleDateString('fr-FR'),
              () => setDueDate(''),
            )}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-[1.5px] border-border rounded-[10px] pl-3 pr-1.5 py-1 focus-within:border-primary">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Nouvelle tâche… tapez @ pour mentionner"
          aria-label="Nouvelle tâche"
          className="flex-1 min-w-0 h-8 text-sm outline-none"
        />
        <button
          type="button"
          aria-label="Échéance"
          title="Échéance"
          onClick={toggleDate}
          className="cursor-pointer w-8 h-8 rounded-md flex items-center justify-center text-text-light hover:bg-muted"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Patient"
          title="Patient"
          onClick={togglePatient}
          className="cursor-pointer w-8 h-8 rounded-md flex items-center justify-center text-text-light hover:bg-muted"
        >
          <User className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={!text}
          onClick={submit}
          className="cursor-pointer h-8 px-3 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-default"
        >
          Ajouter
        </button>
      </div>
      {mentionOpen && (
        <div
          role="listbox"
          aria-label={`Mentionner un soignant · ${service.name}`}
          className="absolute left-[18px] right-[18px] mt-1 z-10 rounded-lg border border-border bg-white shadow-md py-1"
        >
          {candidates.map((c, i) => {
            const key =
              c.kind === 'soignant'
                ? `soi-${c.soignant.id}`
                : `mb-${c.member.user.id}`
            const label =
              c.kind === 'soignant'
                ? c.soignant.name
                : memberName(members, c.member.user.id)
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={`cursor-pointer w-full flex items-center justify-between text-left px-3 py-1.5 text-sm ${i === active ? 'bg-muted' : ''}`}
              >
                {label}
                {c.kind === 'soignant' && (
                  <span className="flex items-center gap-1 text-xs text-text-light">
                    <Users className="w-3 h-3" /> métier
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {dateOpen && (
        <div
          role="dialog"
          aria-label="Date d'échéance"
          onKeyDown={(e) => e.key === 'Escape' && setDateOpen(false)}
          className="absolute left-[18px] mt-1 z-10 rounded-lg border border-border bg-white shadow-md"
        >
          <DateCalendar
            autoFocus
            timezone="UTC"
            value={dueDate ? dayjs.utc(dueDate) : null}
            onChange={(date, state) => {
              if (date?.isValid() && state === 'finish') {
                setDueDate(date.format('YYYY-MM-DD'))
                setDateOpen(false)
              }
            }}
          />
        </div>
      )}
      {patientSearch !== null && (
        <div className="mt-2 rounded-lg border border-border">
          <input
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Rechercher un patient"
            aria-label="Rechercher un patient"
            className="w-full h-8 px-3 text-sm outline-none border-b border-muted"
          />
          {matchingPatients.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPatient({
                  id: p.id,
                  label: `${p.lastName.toUpperCase()} ${p.firstName}`,
                })
                setPatientSearch(null)
              }}
              className="cursor-pointer w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
            >
              {p.lastName.toUpperCase()} {p.firstName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
