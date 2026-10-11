import { GripVertical, Pencil, Plus } from 'lucide-react'
import { type ComponentProps, type ReactNode, useRef, useState } from 'react'

import { Input } from '@/components/ui/input.tsx'
import { cn } from '@/libs/utils.ts'

interface SettingsCardProps {
  title: string
  onRename?: (title: string) => void
  renameLabel?: string
  inputLabel?: string
  count?: ReactNode
  actions?: ReactNode
  empty?: string
  footer?: ReactNode
  children?: ReactNode
}

function EditableTitle({
  title,
  onRename,
  renameLabel,
  inputLabel,
}: {
  title: string
  onRename?: (title: string) => void
  renameLabel: string
  inputLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const skipBlurCommit = useRef(false)

  const start = () => {
    skipBlurCommit.current = false
    setValue(title)
    setEditing(true)
  }

  const commit = () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false
      return
    }
    const trimmed = value.trim()
    setEditing(false)
    // Libellé vide refusé : on referme simplement sans rien envoyer.
    if (trimmed && trimmed !== title) {
      onRename?.(trimmed)
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label={inputLabel}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            skipBlurCommit.current = true
            setEditing(false)
          }
        }}
        onBlur={commit}
        className="h-8 max-w-xs font-semibold text-foreground"
      />
    )
  }

  return (
    <>
      <h2
        data-testid="carte-titre"
        className={cn(
          'truncate text-base font-semibold text-foreground',
          onRename && 'cursor-pointer',
        )}
        tabIndex={onRename ? 0 : undefined}
        onClick={() => onRename && start()}
        onKeyDown={(e) => {
          if (onRename && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            start()
          }
        }}
      >
        {title}
      </h2>
      {onRename && (
        <button
          type="button"
          aria-label={renameLabel}
          title={renameLabel}
          className="flex shrink-0 items-center justify-center w-6 h-6 rounded-md cursor-pointer hover:bg-muted"
          onClick={start}
        >
          <Pencil className="w-3.5 h-3.5 text-[#94a3b8]" />
        </button>
      )}
    </>
  )
}

export function SettingsCard({
  title,
  onRename,
  renameLabel = 'Renommer',
  inputLabel = 'Libellé',
  count,
  actions,
  empty,
  footer,
  children,
}: SettingsCardProps) {
  return (
    <section
      aria-label={title}
      className="bg-white border border-border rounded-[10px] overflow-hidden"
    >
      <div className="flex items-center gap-3 pl-5 pr-3 py-3.5 border-b border-border">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <EditableTitle
            title={title}
            onRename={onRename}
            renameLabel={renameLabel}
            inputLabel={inputLabel}
          />
          {count !== undefined && (
            <span className="shrink-0 text-[13px] text-text-light">
              {count}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      {empty ? (
        <p className="px-5 py-4 text-sm text-text-light">{empty}</p>
      ) : (
        children
      )}
      {footer}
    </section>
  )
}

export function CardFooterButton({
  children,
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full h-[46px] items-center gap-2 px-5 text-left text-sm font-semibold text-primary cursor-pointer hover:bg-[#f8fafc]',
        className,
      )}
      {...props}
    >
      <Plus className="w-4 h-4" />
      {children}
    </button>
  )
}

export function SettingsRow({
  deleted,
  actions,
  children,
}: {
  deleted?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 min-h-[52px] pl-3.5 pr-3 border-b border-muted hover:bg-[#f8fafc]">
      {deleted ? (
        <span />
      ) : (
        <GripVertical
          aria-hidden="true"
          className="w-4 h-4 text-[#cbd5e1] cursor-grab"
        />
      )}
      <div className="flex items-center gap-2.5 min-w-0">{children}</div>
      <div className="flex items-center gap-0.5">{actions}</div>
    </li>
  )
}
