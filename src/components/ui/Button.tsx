/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.97] cursor-pointer disabled:pointer-events-none disabled:bg-gray-200 disabled:text-gray-400 disabled:opacity-100",
  {
    variants: {
      variant: {
        // Redesign simplificado: Fundo sólido, sem borda agressiva.
        // bg-brand puro com texto branco dá só ~3.2:1 (AtlasGR) / ~3.9:1 (TotalTrac) de contraste
        // — abaixo do mínimo AA de 4.5:1 (achado real do axe-core, DQA-19). bg-brand-active já
        // existe pra exatamente este caso (ver comentário de --color-brand-active em globals.css).
        default: "bg-brand-active text-white hover:bg-brand-accent hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(255,86,24,0.2)]",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-600 hover:scale-[1.02]",
        outline: "border border-gray-300 bg-transparent text-ink hover:bg-gray-100",
        secondary: "bg-surface-2 text-ink hover:bg-gray-200 hover:scale-[1.02]",
        ghost: "hover:bg-gray-100 hover:text-ink",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
