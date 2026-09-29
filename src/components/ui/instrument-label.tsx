"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { money } from "@/lib/format"

/** Symbol, exchange, and an optional mark price. Two venues list the same symbol, so the exchange
 *  travels with it rather than being implied by the account the row happens to sit under. */
function InstrumentLabel({ symbol, venue, mark, currency, className, ...props }: Omit<React.ComponentProps<"span">, "children"> & { symbol: string; venue?: string; mark?: number; currency?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)} {...props}>
      <span className="grid min-w-0">
        <span className="truncate font-[650] tracking-[var(--px-tracking-tight)]">{symbol}</span>
        {venue ? <span className="truncate text-[length:var(--px-text-xs)] font-medium text-faint-foreground">{venue}</span> : null}
      </span>
      {mark === undefined ? null : <span className="px-num font-semibold text-muted-foreground">{money(mark, { currency })}</span>}
    </span>
  )
}

export { InstrumentLabel }
