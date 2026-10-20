import type { ServiceMember } from '@/types/serviceMember.ts'

const DAY = 86_400_000
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const hhmm = (d: Date) =>
  d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const memberName = (
  members: ServiceMember[],
  userId: string | null,
): string => {
  const user = members.find((m) => m.user.id === userId)?.user
  if (!user) {
    return 'Un ancien membre'
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

export const dayGroup = (iso: string, now = new Date()) => {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY)
  if (days <= 0) {
    return "Aujourd'hui"
  }
  if (days === 1) {
    return 'Hier'
  }
  if (days < 7) {
    return 'Cette semaine'
  }
  return 'Plus ancien'
}

export const whenLabel = (iso: string, now = new Date()): string => {
  const date = new Date(iso)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  const group = dayGroup(iso, now)
  if (group === "Aujourd'hui") {
    if (minutes < 1) {
      return "à l'instant"
    }
    if (minutes < 60) {
      return `il y a ${minutes} min`
    }
    return `il y a ${Math.floor(minutes / 60)} h`
  }
  if (group === 'Hier') {
    return `Hier ${hhmm(date)}`
  }
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' })
  const dm = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  })
  return `${weekday} ${dm}`
}
