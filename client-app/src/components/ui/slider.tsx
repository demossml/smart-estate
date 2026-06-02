import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number) => void
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, defaultValue, min = 0, max = 100, step = 1, onValueChange, onChange, ...props }, ref) => {
    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = React.useState<number>(
      defaultValue ?? min
    )

    const currentValue = isControlled ? value : internalValue

    const trackProgress = ((currentValue - min) / (max - min)) * 100

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value)
      if (!isControlled) {
        setInternalValue(newValue)
      }
      onValueChange?.(newValue)
      onChange?.(e)
    }

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
        {/* Track background */}
        <div className="relative h-2 w-full rounded-full bg-[var(--muted)]">
          {/* Filled progress */}
          <div
            className="absolute h-2 rounded-full bg-[var(--primary)]"
            style={{ width: `${trackProgress}%` }}
          />
        </div>
        {/* Hidden native range input for accessibility + interaction */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          className={cn(
            "absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent",
            // Thumb styling via vendor prefixes
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-5",
            "[&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-[var(--primary)]",
            "[&::-webkit-slider-thumb]:bg-[var(--card)]",
            "[&::-webkit-slider-thumb]:shadow-md",
            "[&::-webkit-slider-thumb]:transition-colors",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:ring-offset-2",
            "[&::-webkit-slider-thumb]:focus-visible:ring-2",
            "[&::-webkit-slider-thumb]:focus-visible:ring-[var(--ring)]",
            // Firefox thumb
            "[&::-moz-range-thumb]:h-5",
            "[&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-[var(--primary)]",
            "[&::-moz-range-thumb]:bg-[var(--card)]",
            "[&::-moz-range-thumb]:shadow-md",
            "[&::-moz-range-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:ring-offset-2",
            "[&::-moz-range-thumb]:focus-visible:ring-2",
            "[&::-moz-range-thumb]:focus-visible:ring-[var(--ring)]",
            // Remove default track in Firefox
            "[&::-moz-range-track]:bg-transparent"
          )}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
export type { SliderProps }
