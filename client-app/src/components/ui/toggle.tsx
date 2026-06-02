import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleProps {
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  disabled?: boolean
  className?: string
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed, defaultPressed = false, onPressedChange, disabled = false, ...props }, ref) => {
    const isControlled = pressed !== undefined
    const [internalPressed, setInternalPressed] = React.useState(defaultPressed)
    const isOn = isControlled ? pressed : internalPressed

    const handleClick = () => {
      if (disabled) return
      const next = !isOn
      if (!isControlled) {
        setInternalPressed(next)
      }
      onPressedChange?.(next)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        handleClick()
      }
    }

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isOn}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          isOn ? "bg-[var(--primary)]" : "bg-[var(--muted)]",
          className
        )}
        {...props}
      >
        {/* Thumb */}
        <span
          className={cn(
            "pointer-events-none block h-[24px] w-[24px] rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out",
            isOn ? "translate-x-[22px]" : "translate-x-[1px]"
          )}
        />
      </button>
    )
  }
)
Toggle.displayName = "Toggle"

export { Toggle }
export type { ToggleProps }
