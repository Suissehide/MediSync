import { type VariantProps, cva } from 'class-variance-authority'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import React from 'react'
import { cn } from '../../libs/utils.ts'
import { type ButtonProps, buttonVariants } from './button.tsx'

const popupVariants = cva(
  'fixed z-100 min-w-[400px] top-[20%] left-[50%] translate-x-[-50%] translate-y-[-20%] gap-4 bg-card border border-border rounded-sm shadow-xl transition ease-in-out',
)

interface PopupTriggerProps
  extends React.ComponentPropsWithoutRef<typeof Dialog.Trigger>,
    ButtonProps {}

interface PopupContentProps
  extends React.ComponentPropsWithoutRef<typeof Dialog.Content>,
    VariantProps<typeof popupVariants> {}

const Popup = Dialog.Root
const PopupClose = Dialog.Close
const PopupPortal = Dialog.Portal

const PopupContent = React.forwardRef<
  React.ComponentRef<typeof Dialog.Content>,
  PopupContentProps
>(({ className, children, ...props }, ref) => (
  <PopupPortal>
    <PopupOverlay />
    <PopupDescription />
    <Dialog.Content
      ref={ref}
      className={cn(popupVariants(), className)}
      {...props}
    >
      {children}
      <PopupClose className="absolute right-4 top-4 rounded-full text-white bg-foreground/0 p-1 opacity-70 cursor-pointer ring-offset-background transition-opacity hover:opacity-100 hover:bg-foreground/20 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </PopupClose>
    </Dialog.Content>
  </PopupPortal>
))
PopupContent.displayName = Dialog.Content.displayName

const PopupOverlay = React.forwardRef<
  React.ComponentRef<typeof Dialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof Dialog.Overlay>
>(({ className, ...props }, ref) => (
  <Dialog.Overlay
    className={cn(
      'fixed inset-0 z-50 cursor-pointer bg-background/1 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
    ref={ref}
  />
))
PopupOverlay.displayName = Dialog.Overlay.displayName

const PopupTrigger = React.forwardRef<
  React.ComponentRef<typeof Dialog.Trigger>,
  PopupTriggerProps
>(({ className, variant, size, ...props }, ref) => (
  <Dialog.Trigger
    ref={ref}
    className={cn(buttonVariants({ variant, size, className }))}
    {...props}
  />
))
PopupTrigger.displayName = Dialog.Trigger.displayName

const PopupHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-4 py-6 rounded-t-sm bg-primary text-white', className)}
    {...props}
  />
))
PopupHeader.displayName = 'PopupHeader'

const PopupTitle = React.forwardRef<
  React.ComponentRef<typeof Dialog.Title>,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={cn('font-semibold m-0', className)}
    {...props}
  />
))
PopupTitle.displayName = 'PopupTitle'

const PopupDescription = React.forwardRef<
  React.ComponentRef<typeof Dialog.Description>,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={cn('text-sm text-gray-600', className)}
    {...props}
  />
))
PopupDescription.displayName = 'PopupDescription'

const PopupBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('h-full px-4 py-4', className)} {...props} />
))
PopupBody.displayName = 'PopupBody'

const PopupFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex justify-end gap-2 px-4 py-4 border-t border-border',
      className,
    )}
    {...props}
  />
))
PopupFooter.displayName = 'PopupFooter'

export {
  Popup,
  PopupHeader,
  PopupFooter,
  PopupTitle,
  PopupDescription,
  PopupContent,
  PopupBody,
  PopupTrigger,
}
