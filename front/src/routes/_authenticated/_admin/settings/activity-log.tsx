import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useState } from 'react'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import {
  useActivityLogMutations,
  useActivityLogsQuery,
} from '../../../../queries/useActivityLog.ts'

const ACTION_LABELS: Record<string, string> = {
  'patient.created': 'Patient créé',
  'patient.updated': 'Patient modifié',
  'patient.deleted': 'Patient supprimé',
  'patient.enrolled': 'Patient inscrit à un parcours',
  'diagnostic.created': 'Diagnostic créé',
  'diagnostic.updated': 'Diagnostic modifié',
  'appointment.created': 'Rendez-vous créé',
  'appointment.updated': 'Rendez-vous modifié',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS)

const PERIOD_OPTIONS = [
  { label: '7 derniers jours', days: 7 },
  { label: '30 derniers jours', days: 30 },
  { label: '3 derniers mois', days: 90 },
  { label: '12 derniers mois', days: 365 },
]

export const Route = createFileRoute('/_authenticated/_admin/settings/activity-log')({
  component: ActivityLogPage,
})

function ActivityLogPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [periodDays, setPeriodDays] = useState<number | undefined>(undefined)
  const [userSearch, setUserSearch] = useState('')

  const from = periodDays
    ? dayjs().subtract(periodDays, 'day').toISOString()
    : undefined

  const { data } = useActivityLogsQuery({
    page,
    action: action || undefined,
    from,
  })

  const { cleanup } = useActivityLogMutations()

  const logs = (data?.data ?? []).filter((log) => {
    if (!userSearch) return true
    const fullName = `${log.userFirstName ?? ''} ${log.userLastName ?? ''}`.toLowerCase()
    return fullName.includes(userSearch.toLowerCase())
  })

  const totalPages = data ? Math.ceil(data.total / 50) : 1

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Journal d'activité
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm('Supprimer tous les logs de plus de 12 mois ? Cette action est irréversible.')) {
                cleanup.mutate()
              }
            }}
            disabled={cleanup.isPending}
          >
            Nettoyer (&gt;12 mois)
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value)
              setPage(1)
            }}
            className="border border-border rounded px-3 py-1.5 text-sm w-56"
          />
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            className="border border-border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Toutes les actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          <select
            value={periodDays ?? ''}
            onChange={(e) => {
              setPeriodDays(e.target.value ? Number(e.target.value) : undefined)
              setPage(1)
            }}
            className="border border-border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Toutes les périodes</option>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-light">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Heure</th>
                <th className="py-2 pr-4">Utilisateur</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2">Entité</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border hover:bg-muted/30">
                  <td className="py-2 pr-4">{dayjs(log.createdAt).format('DD/MM/YYYY')}</td>
                  <td className="py-2 pr-4">{dayjs(log.createdAt).format('HH:mm')}</td>
                  <td className="py-2 pr-4">
                    {log.userFirstName || log.userLastName
                      ? `${log.userFirstName ?? ''} ${log.userLastName ?? ''}`.trim()
                      : log.userID.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="py-2 text-text-light">
                    {log.entityType} · {log.entityID.slice(0, 8)}…
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-light">
                    Aucune activité trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </Button>
          <span className="text-text-light">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default ActivityLogPage
