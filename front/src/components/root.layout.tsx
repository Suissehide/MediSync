import '../styles/_globals.css'

import type React from 'react'

import { ThemeProvider } from './themeProvider.tsx'
import { Toaster } from './ui/toaster.tsx'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      accentColor="mint"
      grayColor="gray"
      panelBackground="solid"
      scaling="100%"
      radius="medium"
    >
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
