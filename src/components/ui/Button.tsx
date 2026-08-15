/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.97] cursor-pointer disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Nota: as sombras rgba(255,86,24,...) abaixo continuam fixas na tonalidade da AtlasGR —
        // parametrizar a opacidade delas por --brand exigiria um token RGB triplo separado
        // (color-mix não compõe com rgba() arbitrário do Tailwind); ver DESIGN_QA_CENTRAL_ATLASGR.md.
        // Gradiente usa brand-active/brand-2-active (não brand/brand-2 puros): texto branco sobre
        // --brand-2 puro dá só ~2.9:1 (AtlasGR) / ~3.6:1 (TotalTrac) — mesma classe de bug do
        // DQA-19, achada nesta rodada (Onda 8) neste componente (o Button mais reutilizado do
        // app), não coberta pelo --color-brand-active original. hover:brightness-110 foi removido
        // (não hover:bg-*) porque clarear ainda mais o extremo já escurecido derrubava o contraste
        // de volta pra ~4.1:1 no hover — o feedback de interação já existe via shadow e
        // active:scale-[0.97] (classe base), sem precisar reintroduzir o brilho.
        default: "bg-gradient-to-r from-brand-active to-brand-2-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_-6px_rgba(255,86,24,0.55)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_-6px_rgba(255,86,24,0.7)]",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
        outline: "border border-line bg-surface shadow-sm hover:bg-surface-2 hover:text-ink",
        secondary: "bg-surface-2 text-ink shadow-sm hover:bg-surface-2/70",
        ghost: "hover:bg-surface-2 hover:text-ink",
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
