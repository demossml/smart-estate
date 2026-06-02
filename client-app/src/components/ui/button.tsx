import * as React from "react"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
type ButtonSize = "default" | "sm" | "lg" | "icon"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-110 shadow-sm",
  destructive:
    "bg-[var(--destructive)] text-white hover:brightness-110 shadow-sm",
  outline:
    "border border-[var(--border)] bg-transparent hover:bg-[var(--muted)] text-[var(--foreground)]",
  secondary:
    "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted)]/80",
  ghost:
    "hover:bg-[var(--muted)] text-[var(--foreground)] hover:text-[var(--foreground)]",
  link: "text-[var(--primary)] underline-offset-4 hover:underline",
}

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3 text-xs",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }
