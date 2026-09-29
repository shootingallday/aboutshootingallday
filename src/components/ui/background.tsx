"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type Pattern = "dots" | "grid" | "mesh" | "shader"
type Fade = "edges" | "down" | "none"

const blobs = [
  { color: "--primary", strength: 0.16, at: [0.15, 0.2], reach: 0.6, drift: [0.07, 0.05], speed: [0.13, 0.11] },
  { color: "--brand-accent", strength: 0.12, at: [0.85, 0.15], reach: 0.55, drift: [0.06, 0.07], speed: [0.09, 0.15] },
  { color: "--chart-3", strength: 0.08, at: [0.55, 0.95], reach: 0.6, drift: [0.08, 0.04], speed: [0.11, 0.07] },
]

const mesh = blobs
  .map(({ color, strength, at, reach }) => `radial-gradient(at ${at[0] * 100}% ${at[1] * 100}%, color-mix(in oklab, var(${color}) ${strength * 100}%, transparent), transparent ${reach * 100}%)`)
  .join(", ")

const patterns: Record<Exclude<Pattern, "shader">, (cell: number) => React.CSSProperties> = {
  dots: (cell) => ({ backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)", backgroundSize: `${cell}px ${cell}px`, backgroundPosition: "center" }),
  grid: (cell) => ({
    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
    backgroundSize: `${cell}px ${cell}px`,
    backgroundPosition: "center",
  }),
  mesh: () => ({ backgroundImage: mesh }),
}

const fades: Record<Fade, string | undefined> = {
  edges: "radial-gradient(ellipse at center, black 25%, transparent 75%)",
  down: "linear-gradient(to bottom, black 15%, transparent 90%)",
  none: undefined,
}

const vertex = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }"

const fragment = `precision mediump float;
uniform vec2 size;
uniform float time;
uniform vec3 colors[${blobs.length}];
${blobs.map((_, i) => `const vec4 blob${i} = vec4(${blobs[i].at.map((n) => n.toFixed(3)).join(", ")}, ${blobs[i].strength.toFixed(3)}, ${blobs[i].reach.toFixed(3)});`).join("\n")}
${blobs.map((_, i) => `const vec4 move${i} = vec4(${[...blobs[i].drift, ...blobs[i].speed].map((n) => n.toFixed(3)).join(", ")});`).join("\n")}
vec4 over(vec4 under, vec3 color, vec4 blob, vec4 move, vec2 uv) {
  vec2 at = blob.xy + move.xy * vec2(sin(time * move.z), cos(time * move.w) - 1.0);
  vec2 far = max(at, 1.0 - at);
  float alpha = blob.z * clamp(1.0 - length(uv - at) / (length(far) * blob.w), 0.0, 1.0);
  return vec4(color * alpha, alpha) + under * (1.0 - alpha);
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) / size;
  float swell = 0.025 * (1.0 - exp(-time * 0.2));
  uv += swell * vec2(sin(uv.y * 5.0 + time * 0.3), sin(uv.x * 4.0 + time * 0.23));
  vec4 color = vec4(0.0);
${blobs.map((_, i) => `  color = over(color, colors[${i}], blob${i}, move${i}, uv);`).join("\n")}
  gl_FragColor = color;
}`

const stillQuery = "(prefers-reduced-motion: reduce)"
const subscribeStill = (change: () => void) => {
  const query = matchMedia(stillQuery)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}

function useStill() {
  return React.useSyncExternalStore(subscribeStill, () => matchMedia(stillQuery).matches, () => false)
}

function compile(gl: WebGLRenderingContext) {
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)
    if (!shader || !program) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  if (!program) return null
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

function readColors(host: Element) {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  const style = getComputedStyle(host)
  return blobs.flatMap(({ color }) => {
    if (!probe) return [0, 0, 0]
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = "black"
    probe.fillStyle = style.getPropertyValue(color).trim()
    probe.fillRect(0, 0, 1, 1)
    return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((channel) => channel / 255)
  })
}

function useShader(canvas: React.RefObject<HTMLCanvasElement | null>, on: boolean, paused: boolean) {
  const [live, setLive] = React.useState(false)
  const hold = React.useRef(paused)
  const sync = React.useRef(() => {})

  React.useEffect(() => {
    hold.current = paused
    sync.current()
  }, [paused])

  React.useEffect(() => {
    const node = canvas.current
    const gl = on && node ? node.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "low-power" }) : null
    const program = gl && compile(gl)
    if (!node || !gl || !program) {
      setLive(false)
      return
    }
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const point = gl.getAttribLocation(program, "p")
    gl.enableVertexAttribArray(point)
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0)
    const size = gl.getUniformLocation(program, "size")
    const time = gl.getUniformLocation(program, "time")
    const colors = gl.getUniformLocation(program, "colors")

    let elapsed = 0
    let last = 0
    let frame = 0
    let seen = true
    const draw = () => {
      if (gl.isContextLost()) return
      const width = Math.max(1, Math.round(node.clientWidth / 2))
      const height = Math.max(1, Math.round(node.clientHeight / 2))
      if (node.width !== width || node.height !== height) Object.assign(node, { width, height })
      gl.viewport(0, 0, width, height)
      gl.uniform2f(size, width, height)
      gl.uniform1f(time, elapsed)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (last && now - last < 32) return
      if (last) elapsed += Math.min(now - last, 100) / 1000
      last = now
      draw()
    }
    const running = () => !hold.current && seen && !document.hidden
    sync.current = () => {
      if (running() && !frame) frame = requestAnimationFrame(tick)
      if (!running() && frame) {
        cancelAnimationFrame(frame)
        frame = 0
        last = 0
      }
    }
    const recolor = () => {
      gl.uniform3fv(colors, readColors(node))
      draw()
    }
    const visible = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting
      sync.current()
    })
    const resized = new ResizeObserver(draw)
    const themed = new MutationObserver(recolor)
    const lost = () => setLive(false)
    visible.observe(node)
    resized.observe(node)
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
    const shown = () => sync.current()
    document.addEventListener("visibilitychange", shown)
    node.addEventListener("webglcontextlost", lost)
    recolor()
    setLive(true)
    sync.current()
    return () => {
      cancelAnimationFrame(frame)
      frame = 0
      sync.current = () => {}
      visible.disconnect()
      resized.disconnect()
      themed.disconnect()
      document.removeEventListener("visibilitychange", shown)
      node.removeEventListener("webglcontextlost", lost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [canvas, on])

  return live
}

function Background({
  pattern = "dots",
  fade = pattern === "dots" || pattern === "grid" ? "edges" : "none",
  cell = pattern === "grid" ? 32 : 18,
  paused = false,
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { pattern?: Pattern; fade?: Fade; cell?: number; paused?: boolean }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const still = useStill()
  const shader = pattern === "shader"
  const live = useShader(canvas, shader && !still, paused)
  const drawn = shader && live && !still
  return (
    <div
      aria-hidden
      data-slot="background"
      data-pattern={pattern}
      data-renderer={shader ? (drawn ? "webgl" : "static") : undefined}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ maskImage: fades[fade], ...style }}
      {...props}
    >
      <div data-slot="background-layer" className="absolute inset-0" style={drawn ? undefined : patterns[shader ? "mesh" : pattern](cell)} />
      {shader && !still && <canvas ref={canvas} data-slot="background-canvas" className={cn("absolute inset-0 size-full", !drawn && "invisible")} />}
    </div>
  )
}

function ProgressiveBlur({
  side = "bottom",
  blur = 8,
  layers = 5,
  className,
  ...props
}: React.ComponentProps<"div"> & { side?: "top" | "bottom"; blur?: number; layers?: number }) {
  const step = 100 / (layers + 1)
  return (
    <div aria-hidden data-slot="progressive-blur" data-side={side} className={cn("pointer-events-none absolute inset-x-0 h-16", side === "top" ? "top-0" : "bottom-0", className)} {...props}>
      {Array.from({ length: layers }, (_, i) => {
        const band = `linear-gradient(to ${side}, transparent ${i * step}%, black ${(i + 1) * step}%${i < layers - 1 ? `, black ${(i + 2) * step}%, transparent ${(i + 3) * step}%` : ""})`
        const filter = `blur(${blur / 2 ** (layers - 1 - i)}px)`
        return <div key={i} className="absolute inset-0" style={{ maskImage: band, backdropFilter: filter, WebkitBackdropFilter: filter }} />
      })}
    </div>
  )
}

export { Background, ProgressiveBlur }
