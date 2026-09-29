import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent text-[length:var(--px-text-base)] font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-fast outline-none select-none hover:text-foreground not-data-pressed:hover:bg-muted/60 focus-visible:shadow-(--focus-ring) disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-muted data-pressed:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      variant: {
        default: "",
        outline: "border-input bg-card shadow-(--shadow-control)",
      },
      size: {
        default: "h-control min-w-control px-2.5",
        sm: "h-control-sm min-w-control-sm px-2 text-[length:var(--px-text-sm)] [--icon-size:var(--icon-size-sm)]",
        lg: "h-control-lg min-w-control-lg px-3.5 text-[length:var(--px-text-md)] [--icon-size:var(--icon-size-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({ className, variant = "default", size = "default", ...props }: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle, toggleVariants }
