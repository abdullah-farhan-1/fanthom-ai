"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"
import { BrandSpinner } from "@/components/signal-loader"

// Signal-styled notifications: frosted glass, a coloured accent strip and icon badge per type,
// and a mono { type } label above the message (styles in globals.css, .signal-toast).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <BrandSpinner size="sm" className="text-brand" />,
      }}
      toastOptions={{
        duration: 5000,
        unstyled: true,
        classNames: {
          toast: "signal-toast",
          icon: "signal-toast-icon",
          content: "signal-toast-content",
          title: "signal-toast-title",
          description: "signal-toast-description",
          actionButton: "signal-toast-action",
          cancelButton: "signal-toast-cancel",
          closeButton: "signal-toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
