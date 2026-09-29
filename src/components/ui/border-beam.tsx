"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const lights = {
  beam: {
    dwell: "--px-dwell-medium",
    keyframes: { offsetDistance: ["0%", "100%"] },
    className: "top-0 left-0 aspect-square w-16 bg-linear-to-l from-primary to-transparent [offset-path:border-box] rtl:bg-linear-to-r",
  },
  shine: {
    dwell: "--px-dwell-long",
    keyframes: { rotate: ["0deg", "360deg"] },
    className:
      "top-1/2 left-1/2 size-[hypot(100cqw,100cqh)] -translate-1/2 bg-[conic-gradient(transparent,var(--primary)_12.5%,transparent_25%_50%,var(--primary)_62.5%,transparent_75%)]",
  },
}

type BorderBeamVariant = keyof typeof lights

function BorderBeam({
  variant = "beam",
  active = true,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { variant?: BorderBeamVariant; active?: boolean }) {
  const light = React.useRef<HTMLSpanElement>(null)
  const run = React.useRef<Animation | null>(null)
  const live = React.useRef(active)
  live.current = active

  React.useEffect(() => {
    const node = light.current
    if (!node) return
    const still = matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      run.current?.cancel()
      run.current = null
      if (still.matches) return
      const style = getComputedStyle(node)
      run.current = node.animate(lights[variant].keyframes, {
        duration: parseFloat(style.getPropertyValue(lights[variant].dwell)),
        iterations: Infinity,
        direction: style.direction === "rtl" ? "reverse" : "normal",
      })
      if (!live.current) run.current.pause()
    }
    sync()
    still.addEventListener("change", sync)
    return () => {
      still.removeEventListener("change", sync)
      run.current?.cancel()
      run.current = null
    }
  }, [variant])

  React.useEffect(() => {
    if (active) run.current?.play()
    else run.current?.pause()
  }, [active])

  return (
    <span
      aria-hidden="true"
      data-slot="border-beam"
      data-variant={variant}
      data-active={active ? "" : undefined}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] p-px [container-type:size] opacity-0 transition-opacity spring-smooth [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)] data-active:opacity-100 motion-reduce:bg-primary/50",
        className
      )}
      {...props}
    >
      <span ref={light} data-slot="border-beam-light" className={cn("absolute motion-reduce:hidden", lights[variant].className)} />
    </span>
  )
}

export { BorderBeam, type BorderBeamVariant }
