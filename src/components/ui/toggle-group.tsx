import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"
import { useMorph, type Spring } from "@/hooks/use-morph"

type ToggleGroupStyle = { variant?: VariantProps<typeof toggleVariants>["variant"] | "segmented"; size?: VariantProps<typeof toggleVariants>["size"]; spacing?: number }

const ToggleGroupContext = React.createContext<ToggleGroupStyle & { travels?: boolean }>({ spacing: 0 })

const segmentedItem = cva(
  "group/toggle relative inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-fast outline-none select-none before:absolute before:top-1/2 before:start-1/2 before:size-full before:min-h-control-sm before:-translate-x-1/2 rtl:before:translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:text-foreground focus-visible:z-(--z-raised) focus-visible:shadow-(--focus-ring) disabled:pointer-events-none disabled:opacity-50 data-pressed:text-foreground pointer-coarse:min-h-control-lg data-icon:flex-none data-icon:px-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      size: {
        default: "h-[calc(var(--control-h)-8px)] min-w-[calc(var(--control-h)-8px)] px-3 text-[length:var(--px-text-sm)]",
        sm: "h-[calc(var(--control-h-sm)-6px)] min-w-[calc(var(--control-h-sm)-6px)] px-2 text-[length:var(--px-text-xs)] [--icon-size:var(--icon-size-sm)]",
        lg: "h-[calc(var(--control-h-lg)-8px)] min-w-[calc(var(--control-h-lg)-8px)] px-3.5 text-[length:var(--px-text-md)] [--icon-size:var(--icon-size-lg)]",
      },
    },
    defaultVariants: { size: "default" },
  }
)

/** A row of items where pressing one can release the others. `default` and `outline` join toggles
 *  edge to edge; `segmented` is the compact switch between two to five views or modes: a muted
 *  track whose chosen item is raised on a card plate that slides to the item pressed. An item that
 *  holds only an icon is drawn square there, and names itself with `aria-label`. A segmented group
 *  that holds one choice keeps it: pressing the chosen item again leaves it chosen. */
function ToggleGroup({ className, style, variant, size, spacing = 0, spring, orientation = "horizontal", multiple = false, onValueChange, children, ...props }: Omit<ToggleGroupPrimitive.Props, "style"> & ToggleGroupStyle & { style?: React.CSSProperties; spring?: Spring }) {
  const segmented = variant === "segmented"
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      orientation={orientation}
      multiple={multiple}
      onValueChange={(value, details) => (segmented && !multiple && !value.length ? details.cancel() : onValueChange?.(value, details))}
      style={segmented ? style : { gap: `${spacing * 0.25}rem`, ...style }}
      className={cn(
        "group/toggle-group relative flex w-fit items-center data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
        segmented && "gap-0.5 rounded-control border border-border bg-muted p-[3px]",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, travels: !multiple }}>
        {multiple ? null : <ToggleGroupPlate spring={spring} className={segmented ? "bg-card shadow-(--shadow-control)" : "bg-muted"} />}
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

const corners = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"] as const

/** The tint behind the pressed item of a single-choice group: one element that travels to the item
 *  just pressed, taking that item's box and its corners so a joined group keeps its square inner
 *  edges. It is rendered before the items so they paint over it, and takes no pointer, because the
 *  item it covers is the control — which is why an item of a group that travels is positioned, since
 *  an absolute plate otherwise paints over the label of the item it sits behind. A group that can
 *  hold several items pressed has no one place for it, so it is not drawn there and each item keeps
 *  its own tint. It sits at the group's top-left corner, laid out left to right in either reading
 *  direction, and travels by transform while its size animates, so the corner its box is measured
 *  from never moves and the flight is not a layout shift. */
function ToggleGroupPlate({ spring, className }: { spring?: Spring; className: string }) {
  const morph = useMorph({ spring })
  const anchor = React.useRef<HTMLSpanElement>(null)
  const [seat, setSeat] = React.useState<{ box: Record<string, number>; opacity: number }>()

  React.useLayoutEffect(() => {
    const group = anchor.current?.parentElement
    if (!group) return
    const read = () => {
      const item = group.querySelector<HTMLElement>('[data-slot="toggle-group-item"][data-pressed]')
      if (!item) return setSeat((held) => (held ? { ...held, opacity: 0 } : held))
      const style = getComputedStyle(item)
      const inside = getComputedStyle(group)
      const frame = group.getBoundingClientRect()
      const box = item.getBoundingClientRect()
      const next = {
        x: box.x - frame.x - parseFloat(inside.borderLeftWidth),
        y: box.y - frame.y - parseFloat(inside.borderTopWidth),
        width: box.width,
        height: box.height,
        ...Object.fromEntries(corners.map((corner) => [corner, parseFloat(style[corner]) || 0])),
      }
      /* A group can be disabled while one of its items is pressed, and the two have to read as one
         disabled control, so the plate carries the dimming its item carries, in the same frame. */
      setSeat({ box: next, opacity: parseFloat(style.opacity) || 1 })
    }
    read()
    const chosen = new MutationObserver(read)
    chosen.observe(group, { subtree: true, attributes: true, attributeFilter: ["data-pressed", "disabled"] })
    const resized = new ResizeObserver(read)
    resized.observe(group)
    return () => {
      chosen.disconnect()
      resized.disconnect()
    }
  }, [])

  return (
    <motion.span
      key={seat ? "seated" : "waiting"}
      ref={anchor}
      data-slot="toggle-group-plate"
      role="presentation"
      hidden={!seat}
      initial={false}
      animate={seat?.box}
      transition={morph.transition}
      style={{ opacity: seat?.opacity }}
      className={cn("pointer-events-none absolute top-0 start-0 [direction:ltr]", className)}
    />
  )
}

/* The plate is a child of the group, so an item is no longer the group's first or last child.
   Every item is a button and the plate is not, so the joined edges are decided by type instead. */
const joined =
  "focus-visible:relative focus-visible:z-(--z-raised) group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:[&:not(:last-of-type)]:rounded-e-none group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:[&:not(:first-of-type)]:rounded-s-none group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:[&:not(:first-of-type)]:border-s-0 group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:[&:not(:last-of-type)]:rounded-b-none group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:[&:not(:first-of-type)]:rounded-t-none group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:[&:not(:first-of-type)]:border-t-0"

const iconOnly = (children: React.ReactNode) => {
  const parts = React.Children.toArray(children)
  return parts.length > 0 && parts.every((part) => React.isValidElement(part) && typeof part.type !== "string")
}

function ToggleGroupItem({ className, variant, size, children, ...props }: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const group = React.useContext(ToggleGroupContext)
  const segmented = group.variant === "segmented"
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-spacing={group.spacing}
      data-icon={segmented && iconOnly(children) ? "" : undefined}
      className={cn(
        group.variant === "segmented"
          ? [segmentedItem({ size: group.size ?? size }), !group.travels && "data-pressed:bg-card data-pressed:shadow-(--shadow-control)"]
          : [toggleVariants({ variant: group.variant ?? variant, size: group.size ?? size }), joined],
        group.travels && "relative data-pressed:bg-transparent",
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
