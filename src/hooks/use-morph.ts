"use client"

import * as React from "react"

export type Spring = "snappy" | "smooth" | "fluid"

type Flight = { duration: number; curve: string; ease: (t: number) => number; radius: number; stretch: number[] }

export function linearEase(curve: string) {
  const points = (curve.match(/linear\((.*)\)/)?.[1] ?? "0, 1").split(",").map(Number)
  const last = points.length - 1
  return (t: number) => {
    const at = Math.min(Math.max(t, 0), 1) * last
    const low = Math.min(Math.floor(at), last - 1)
    return points[low] + (points[low + 1] - points[low]) * (at - low)
  }
}

function stretchOf(ease: (t: number) => number, amount: number, steps = 24) {
  const speed = Array.from({ length: steps + 1 }, (_, i) => Math.abs(ease(Math.min((i + 0.5) / steps, 1)) - ease(Math.max((i - 0.5) / steps, 0))))
  const top = Math.max(...speed) || 1
  return speed.map((value, i) => (i === 0 || i === steps ? 1 : 1 + (amount * value) / top))
}

/**
 * The flight a surface morphs on and its corner radius as a number, all read from the tokens in
 * force. `spring` names one of the `--px-spring-*` presets — snappy for controls, smooth for
 * surfaces, fluid for forming — so retuning a preset in tokens.css retunes every morph that uses
 * it, and the reduced-motion block, which zeroes the durations the presets point at, lands the
 * surface on its end state.
 *
 * Motion moves a box by scaling it and only undoes that scale for a radius it can read as a number,
 * so a radius left in a class stretches for the length of the flight. Before the tokens can be read
 * — on a server, and on the render that hydrates it — the radius stays the variable the markup
 * already carries, so both sides agree.
 */
export function useMorph({ radius = "--radius-sm", spring = "snappy" }: { radius?: string; spring?: Spring } = {}) {
  const [flight, setFlight] = React.useState<Flight>()

  React.useLayoutEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const token = (name: string) => style.getPropertyValue(name).trim()
    const curve = token(`--px-spring-${spring}`)
    const ease = linearEase(curve)
    setFlight({
      duration: (parseFloat(token(`--px-spring-${spring}-duration`)) || 0) / 1000,
      curve,
      ease,
      radius: parseFloat(token(radius)) || 0,
      stretch: stretchOf(ease, (parseFloat(token(`--px-spring-${spring}-stretch`)) || 0) / 100),
    })
  }, [radius, spring])

  return {
    transition: flight && { duration: flight.duration, ease: flight.ease },
    timing: flight && { duration: flight.duration * 1000, easing: flight.curve || "linear" },
    style: { borderRadius: flight ? flight.radius : `var(${radius})` },
    stretch: flight?.stretch,
  }
}
