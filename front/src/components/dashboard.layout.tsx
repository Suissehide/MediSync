import type React from 'react'
import { useState } from 'react'

import Sidebar from './custom/sidebar/sidebar.tsx'
import Navbar from './navbar.tsx'

interface DashboardLayoutProps {
  components?: string[]
}

function DashboardLayout({
  components,
  children,
}: DashboardLayoutProps & {
  children: React.ReactNode
}) {
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  return (
    <div className="flex h-screen">
      <Sidebar components={components ?? []} isVisible={sidebarVisible} />
      <div
        className={`flex-1 ${sidebarVisible ? 'ml-64' : ''} flex flex-col transition-all duration-300`}
      >
        <Navbar toggleSidebar={toggleSidebar} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

export default DashboardLayout
