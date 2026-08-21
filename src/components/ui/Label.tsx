import * as React from "react"
import { cn } from "../../lib/utils"

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 block",
          className
        )}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
