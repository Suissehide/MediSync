import type React from 'react'

import { cn } from '../../libs/utils.ts'

// Le décor commun des pages publiques d'authentification : logo et carrés animés.
export const AuthLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden w-full h-screen flex relative">
    <div className="absolute top-6 left-2 z-20">
      <h1 className="px-2 text-3xl font-bold">
        <span className="text-primary">Medi</span>Sync
      </h1>
    </div>

    <div className="flex-1 flex justify-end">
      {children}

      <div className="absolute left-[-15%] top-[200px] animate-bounce subtle-bounce">
        <div className="rotate-[60deg] w-[200px] h-[200px] sm:w-[500px] sm:h-[500px] bg-gradient-to-b from-primary to-primary-foreground p-6 rounded-[2rem] sm:rounded-[5rem]" />
      </div>
      <div
        className="absolute right-[-15%] top-[-35px] sm:top-[-75px] animate-bounce subtle-bounce"
        style={{ animationDelay: '-1.7s' }}
      >
        <div className="rotate-[210deg] w-[200px] h-[200px] sm:w-[500px] sm:h-[500px] bg-gradient-to-b from-primary to-primary-foreground p-6 rounded-[2rem] sm:rounded-[5rem]" />
      </div>
    </div>
  </div>
)

export const AUTH_CARD_CLASS =
  'z-10 w-auto sm:w-[450px] left-4 right-4 sm:left-auto top-1/2 -translate-y-1/2 bg-card/45 flex flex-col items-center px-6 py-6 sm:px-12 sm:py-8 rounded-2xl border border-gray-100 backdrop-blur-sm absolute'

export const AuthCard = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={cn(AUTH_CARD_CLASS, 'sm:right-8', className)}>{children}</div>
)
