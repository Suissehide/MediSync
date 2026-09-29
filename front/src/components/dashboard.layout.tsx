import type React from 'react'
import { useState } from 'react'

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
  const [sidebarVisible, setSidebarVisible] = useState(true)
  // Le bandeau d'echelle (36px) s'ajoute sous la barre : tout le reste descend d'autant.
  const bandeau = useBandeauEchelle()

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  return (
    <div className="h-screen overflow-hidden bg-foreground">
      <Navbar toggleSidebar={toggleSidebar} />
      {bandeau && <BandeauEchelle bandeau={bandeau} />}
      <div
        className={`flex overflow-hidden ${
          bandeau
            ? 'mt-[100px] h-[calc(100vh-100px)]'
            : 'mt-16 h-[calc(100vh-4rem)]'
        }`}
      >
        <Sidebar
          sousUnBandeau={bandeau !== null}
          components={components ?? []}
          quickActions={quickActions}
          isVisible={sidebarVisible}
        />

        <main
          className={`flex-1 overflow-hidden bg-background rounded transition-all duration-300 ${
            sidebarVisible ? 'ml-64' : 'ml-0'
          }`}
        >
          <div className="h-full bg-foreground p-2 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 bg-card p-6 rounded-xl flex flex-col overflow-hidden">
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
