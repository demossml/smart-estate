import * as React from "react"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent",
  secondary:
    "bg-[var(--muted)] text-[var(--foreground)] border-transparent",
  destructive:
    "bg-[var(--destructive)] text-white border-transparent",
  outline:
    "bg-transparent text-[var(--foreground)] border-[var(--border)]",
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2",
          variantStyles[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }
export type { BadgeProps, BadgeVariant }
