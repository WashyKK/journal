"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function Modal({ open, onOpenChange, title, children, footer, className }: ModalProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-0 flex items-start justify-center overflow-auto p-4">
        <div className={cn("mt-10 w-full max-w-3xl rounded-lg border bg-background shadow-lg", className)}>
          {title ? (
            <div className="border-b px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-semibold leading-none tracking-tight">{title}</div>
                <button onClick={() => onOpenChange(false)} className="text-sm text-muted-foreground hover:opacity-80">Close</button>
              </div>
            </div>
          ) : null}
          <div className="px-6 py-4">{children}</div>
          {footer ? <div className="border-t px-6 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

