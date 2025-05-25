import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../components/dashboard.layout.tsx'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import frLocale from '@fullcalendar/core/locales/fr'
import { useSoignantStore } from '../store/useSoignantStore.ts'
import { CalendarRange } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  shouldReload({ context }) {
    return !context.authState.isAuthenticated
  },
  component: Dashboard,
})

function Dashboard() {
  const selectedId = useSoignantStore((state) => state.selectedSoignantId)
  const soignant = useSoignantStore((state) =>
    state.soignants.find((s) => s.id === selectedId),
  )

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <h2 className="flex gap-2 items-center px-4 m-0! text-text">
          <CalendarRange />
          {soignant ? soignant.name : ''}
        </h2>

        <div className="flex-1 min-h-0 overflow-hidden">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
            initialView="timeGridWeek"
            locale={frLocale}
            weekends={false}
            allDaySlot={false}
            headerToolbar={{
              left: 'title',
              center: 'dayGridMonth,timeGridWeek,listWeek',
              right: 'prev,next today',
            }}
            titleFormat={{
              day: '2-digit',
              month: 'long',
            }}
            dayHeaderFormat={{
              weekday: 'short',
              day: 'numeric',
            }}
            slotLabelFormat={(arg) => {
              const hour = arg.date.hour.toString()
              const minute = arg.date.minute.toString().padStart(2, '0')
              return minute === '00' ? `${hour}h` : `${hour}:${minute}`
            }}
            height="100%"
            slotMinTime="06:00:00"
            slotDuration="01:00:00"
            slotLabelInterval="01:00"
            // eventContent={(arg) => {
            //   const { soignant, location } = arg.event.extendedProps
            //
            //   return {
            //     html: `
            //         <div>${arg.event.title}</div>
            //         <small>
            //           ${soignant ? `${soignant} |` : ''}
            //           ${location ? `${location}` : ''}
            //         </small>
            //     `,
            //   }
            // }}
            events={[
              {
                id: '1',
                title: 'Événement 1',
                start: '2025-04-29T10:00:00',
                end: '2025-04-29T11:00:00',
                textColor: '#334155',
                backgroundColor: '#FFADAD',
                borderColor: '#FFADAD',
                editable: true,
                extendedProps: {
                  location: 'A-102',
                  soignant: 'Jean Dupont',
                },
              },
              {
                id: '2',
                title: 'Événement 2',
                start: '2025-04-29T14:30:00',
                end: '2025-04-29T17:00:00',
                textColor: '#334155',
                backgroundColor: '#DEDAF4',
                borderColor: '#DEDAF4',
              },
            ]}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Dashboard
