import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A table the page owns: rows written in markup, not fed from state. Reach for `DataTable` once
 * the set sorts, selects, or outgrows the viewport.
 *
 * The scroll container is a named region rather than a bare overflow box, so a reader who lands in
 * it by keyboard is told where they are and can leave. `label` names both the region and the
 * table; a `TableCaption` adds the sentence a reader sees.
 */
function Table({ label, className, containerClassName, ...props }: React.ComponentProps<"table"> & { label: string; containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("w-full min-w-0 overflow-x-auto rounded-card outline-none focus-visible:shadow-(--focus-ring)", containerClassName)}
    >
      <table data-slot="table" aria-label={label} className={cn("w-full caption-bottom border-collapse text-body", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_th]:border-b [&_th]:border-border", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:hover]:bg-accent [&_tr:last-child_td]:border-b-0", className)} {...props} />
}

/** The summary row. It keeps the rule that separates it from the body and drops the row borders
 *  underneath, so the total reads as one line rather than another record. No tone role reads on
 *  its `--muted` plate, so every cell takes the text role and a signed total is told apart by its
 *  sign. */
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted [&_td]:border-b-0 [&_td]:font-semibold [&_td]:text-foreground [&_th]:border-b-0 [&_th]:font-semibold [&_th]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("transition-colors duration-fast data-selected:bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]", className)}
      {...props}
    />
  )
}

/** `align="end"` puts money and every other numeral at the end of the cell, which mirrors under
 *  RTL, and gives it tabular figures so a column of numbers holds one width. */
function TableHead({ align = "start", className, ...props }: Omit<React.ComponentProps<"th">, "align"> & { align?: "start" | "end" }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "border-b border-border px-cell py-3 text-[length:var(--px-text-xs)] font-semibold text-muted-foreground",
        align === "end" ? "text-end" : "text-start",
        className
      )}
      {...props}
    />
  )
}

/** `scope="row"` makes the cell the row's header, so a reader moving across the row hears what
 *  each number belongs to. It keeps the cell's own type, not the column header's. */
function TableCell({ align = "start", scope, className, ...props }: Omit<React.ComponentProps<"td">, "align"> & { align?: "start" | "end" }) {
  const cell = cn(
    "h-row border-b border-border px-cell font-medium text-muted-foreground first:font-semibold first:text-foreground",
    align === "end" ? "text-end tabular-nums" : "text-start",
    className
  )
  return scope ? <th data-slot="table-cell" scope={scope} className={cell} {...props} /> : <td data-slot="table-cell" className={cell} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 text-start text-[length:var(--px-text-sm)] text-muted-foreground", className)} {...props} />
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
