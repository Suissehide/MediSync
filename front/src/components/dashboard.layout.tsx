import { useRouterState } from '@tanstack/react-router'
import type React from 'react'
import { useEffect, useState } from 'react'

import { BandeauEchelle, useBandeauEchelle } from './custom/bandeauEchelle.tsx'
import Sidebar from './custom/sidebar/sidebar.tsx'
import Navbar from './navbar.tsx'

interface DashboardLayoutProps {
  components?: string[]
  quickActions?: React.ReactNode[]
}

function DashboardLayout({
  components,
  quickActions,
  children,
}: DashboardLayoutProps & {
  children: React.ReactNode
}) {
  // Sous `md`, le panneau est un tiroir : ferme par defaut, referme a chaque navigation.
  const [mobile] = useState(() => window.innerWidth < 768)
  const [sidebarVisible, setSidebarVisible] = useState(!mobile)
  const tiroirOuvert = mobile && sidebarVisible
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [cheminVu, setCheminVu] = useState(pathname)
  if (pathname !== cheminVu) {
    setCheminVu(pathname)
    if (mobile) {
      setSidebarVisible(false)
    }
  }
  // Le bandeau d'echelle (36px) s'ajoute sous la barre : tout le reste descend d'autant.
  const bandeau = useBandeauEchelle()

  useEffect(() => {
    if (!tiroirOuvert) {
      return
    }
    const fermer = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarVisible(false)
      }
    }
    document.addEventListener('keydown', fermer)
    return () => document.removeEventListener('keydown', fermer)
  }, [tiroirOuvert])

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  return (
    <div className="h-dvh overflow-hidden bg-foreground">
      <Navbar toggleSidebar={toggleSidebar} />
      {bandeau && <BandeauEchelle bandeau={bandeau} />}
      <div
        className={`flex overflow-hidden ${
          bandeau
            ? 'mt-[100px] h-[calc(100dvh-100px)]'
            : 'mt-16 h-[calc(100dvh-4rem)]'
        }`}
      >
        {tiroirOuvert && (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setSidebarVisible(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/50"
          />
        )}
        <Sidebar
          sousUnBandeau={bandeau !== null}
          components={components ?? []}
          quickActions={quickActions}
          isVisible={sidebarVisible}
        />

        <main
          className={`flex-1 min-w-0 overflow-hidden bg-background rounded transition-all duration-300 ${
            sidebarVisible ? 'md:ml-64' : 'ml-0'
          }`}
        >
          <div className="h-full bg-foreground p-2 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 bg-card p-3 md:p-6 rounded-xl flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 flex flex-col overflow-auto">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
