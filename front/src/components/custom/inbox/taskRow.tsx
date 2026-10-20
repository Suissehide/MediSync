import { Calendar, Check, User } from 'lucide-react'

import type { InboxTask } from '@/queries/useInbox.ts'
import { useServiceMembers } from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { memberName, whenLabel } from './inbox.utils.ts'

const pad2 = (n: number) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const dueLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })

export function TaskRow({
  task,
  highlighted,
  showService,
  done,
  onToggle,
}: {
  task: InboxTask
  highlighted: boolean
  showService: boolean
  done: boolean
  onToggle: () => void
}) {
  const me = useAuthStore((state) => state.user?.id)
  const members = useServiceMembers(task.service)
  const late = !done && task.dueDate !== null && task.dueDate < today()
  const author =
    task.authorId === null
      ? null
      : task.authorId === me
        ? 'Par vous'
        : `Par ${memberName(members, task.authorId)}`
  return (
    <div
      data-task={task.id}
      data-highlighted={highlighted}
      className={`flex gap-3 px-[18px] py-3 border-b border-muted transition-colors duration-700 ${highlighted ? 'bg-[#f0fdfa]' : 'bg-white'}`}
    >
      <label className="relative w-5 h-5 mt-0.5 shrink-0 inline-block cursor-pointer">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          aria-label={task.text}
          className={`cursor-pointer appearance-none w-5 h-5 rounded-md border-[1.5px] ${done ? 'bg-[#16a34a] border-[#16a34a]' : 'border-[#cbd5e1] bg-white'}`}
        />
        {done && (
          <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto pointer-events-none" />
        )}
      </label>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm whitespace-pre-line ${done ? 'line-through text-[#94a3b8]' : 'text-foreground'}`}
        >
          {task.text}
        </p>
        {!done && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.assigneeIds.map((id) => (
              <span
                key={id}
                className={`px-2 rounded-full text-xs font-medium ${id === me ? 'bg-blue-50 text-primary' : 'bg-muted text-text-dark'}`}
              >
                @{id === me ? 'vous' : memberName(members, id)}
              </span>
            ))}
            {task.patient && (
              <span className="px-2 rounded-full border border-border text-xs flex items-center gap-1">
                <User className="w-3 h-3" />{' '}
                {task.patient.lastName.toUpperCase()} {task.patient.firstName}
              </span>
            )}
            {task.dueDate && (
              <span
                className={`text-xs font-semibold flex items-center gap-1 ${late ? 'text-[#b91c1c]' : 'text-text-light'}`}
              >
                <Calendar className="w-3 h-3" /> {dueLabel(task.dueDate)}
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-text-light mt-1">
          {author ? `${author} · ` : ''}
          {whenLabel(task.createdAt)}
          {showService ? ` · ${task.service.name}` : ''}
        </p>
      </div>
    </div>
  )
}
