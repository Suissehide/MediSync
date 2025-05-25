import type React from 'react'
import { useState } from 'react'
import Navbar from './navbar.tsx'
import Sidebar from './custom/Sidebar/sidebar.tsx'

function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible)
  }

  return (
    <div className="flex h-screen">
      <Sidebar isVisible={sidebarVisible} />
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
