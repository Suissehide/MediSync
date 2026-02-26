import type React from 'react'
import { useState } from 'react'

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

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  return (
    <div className="h-screen overflow-hidden bg-foreground">
      <Navbar toggleSidebar={toggleSidebar} />
      <div className="flex mt-16 h-[calc(100vh-4rem)] overflow-hidden">
        <Sidebar
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
            <div className="flex-1 min-h-0 bg-card p-6 rounded-xl flex flex-col overflow-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
