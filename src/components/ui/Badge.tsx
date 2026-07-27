/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default: "bg-white/10 text-gray-200 focus:ring-white/30",
        success: "bg-success/15 text-success focus:ring-success/40",
        warning: "bg-warning/15 text-warning focus:ring-warning/40",
        danger: "bg-danger/15 text-danger focus:ring-danger/40",
        info: "bg-info/15 text-info focus:ring-info/40",
        neon: "bg-atlas-orange/15 text-atlas-orange focus:ring-atlas-orange/40",
        gradient: "bg-gradient-to-r from-atlas-orange to-white text-slate-950 font-black shadow-[0_0_12px_-2px_rgba(255,86,24,0.6)] focus:ring-atlas-orange/40",
        outline: "border border-white/15 text-gray-300 focus:ring-white/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
