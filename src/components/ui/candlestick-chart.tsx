import * as React from "react"
import { Bar, BarChart, ComposedChart, Tooltip, useActiveTooltipDataPoints, useIsTooltipActive } from "recharts"

import { ChartDataTable, ChartGrid, ChartLine, ChartPlot, ChartRoot, ChartTooltip, ChartXAxis, ChartYAxis, chartSummary } from "@/components/ui/chart"
import { useFramed } from "@/components/ui/ticker"
import { MINUS } from "@/lib/format"
import { formatTime, readLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number }

type Row = Candle & { at: string; span: [number, number] }

type Shape = { x?: number; y?: number; width?: number; height?: number; payload?: Row }

type CandlestickChartProps = Omit<React.ComponentProps<"figure">, "children"> & {
  candles: Candle[]
  label: string
  kind?: "candle" | "ohlc"
  fraction?: number
  range?: [number, number]
  time?: Intl.DateTimeFormatOptions
  size?: "sm" | "lg"
  state?: "loading" | "empty" | "error"
  children?: React.ReactNode
}

const VOLUME_H = 64
const TIME_H = 24
const READOUT_H = 28
const directionOf = (row: Candle) => (row.close > row.open ? "gain" : row.close < row.open ? "loss" : undefined)
const ink = { stroke: "var(--chart-line)" }

function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= raw) ?? 10) * power
}

function scaleFor(low: number, high: number, count: number) {
  const pad = (high - low) * 0.08 || Math.abs(high) * 0.001 || 1
  const step = niceStep((high - low + 2 * pad) / count)
  const places = Math.max(0, -Math.floor(Math.log10(step)) + (step / 10 ** Math.floor(Math.log10(step)) === 2.5 ? 1 : 0))
  const round = (value: number) => Number(value.toFixed(places))
  const from = low === 0 ? 0 : round(Math.floor((low - pad) / step) * step)
  const to = round(Math.ceil((high + pad) / step) * step)
  const ticks: number[] = []
  for (let tick = from; tick <= to + step / 2; tick = round(tick + step)) ticks.push(tick)
  return { domain: [from, to] as [number, number], ticks, places }
}

function useSteadyScale(low: number, high: number, count: number) {
  const held = React.useRef<ReturnType<typeof scaleFor> | null>(null)
  const was = held.current
  if (Number.isFinite(low) && Number.isFinite(high) && (!was || low < was.domain[0] || high > was.domain[1] || high - low < (was.domain[1] - was.domain[0]) / 3)) held.current = scaleFor(low, high, count)
  return held.current ?? scaleFor(0, 1, count)
}

function CandleShape({ x = 0, y = 0, width = 0, height = 0, payload }: Shape) {
  if (!payload) return null
  const top = Math.min(y, y + height)
  const span = Math.abs(height)
  const [low, high] = payload.span
  const at = (value: number) => top + (high === low ? span / 2 : ((high - value) / (high - low)) * span)
  const mid = Math.round(x + width / 2) + 0.5
  const tone = directionOf(payload)
  const [upper, lower] = [at(Math.max(payload.open, payload.close)), at(Math.min(payload.open, payload.close))]
  const body = Math.max(1, lower - upper)
  return (
    <g data-tone={tone} data-slot="candle">
      <line x1={mid} x2={mid} y1={top} y2={top + span} strokeWidth={1} style={ink} />
      {tone ? (
        <rect x={Math.round(x) + 0.5} y={upper} width={Math.max(1, Math.round(width) - 1)} height={body} rx={1} strokeWidth={1} style={{ ...ink, fill: tone === "gain" ? "var(--card)" : "var(--chart-line)" }} />
      ) : (
        <line x1={Math.round(x)} x2={Math.round(x + width)} y1={Math.round(upper) + 0.5} y2={Math.round(upper) + 0.5} strokeWidth={1} style={ink} />
      )}
    </g>
  )
}

function OhlcShape({ x = 0, y = 0, width = 0, height = 0, payload }: Shape) {
  if (!payload) return null
  const top = Math.min(y, y + height)
  const span = Math.abs(height)
  const [low, high] = payload.span
  const at = (value: number) => top + (high === low ? span / 2 : ((high - value) / (high - low)) * span)
  const mid = Math.round(x + width / 2)
  return (
    <g data-tone={directionOf(payload)} data-slot="candle" strokeWidth={2} strokeLinecap="square">
      <line x1={mid} x2={mid} y1={top} y2={top + span} style={ink} />
      <line x1={Math.round(x) + 1} x2={mid} y1={at(payload.open)} y2={at(payload.open)} style={ink} />
      <line x1={mid} x2={Math.round(x + width) - 1} y1={at(payload.close)} y2={at(payload.close)} style={ink} />
    </g>
  )
}

function VolumeShape({ x = 0, y = 0, width = 0, height = 0, payload }: Shape) {
  if (!payload || height <= 0) return null
  const r = Math.min(2, width / 2, height)
  const [left, right, bottom] = [Math.round(x) + 0.5, Math.round(x + width) - 0.5, y + height]
  return <path data-slot="volume" d={`M${left},${bottom}V${y + r}Q${left},${y} ${left + r},${y}H${right - r}Q${right},${y} ${right},${y + r}V${bottom}Z`} style={{ fill: "var(--chart-axis)" }} />
}

function VolumeCursor({ x = 0, width = 0, height = 0, y = 0 }: { x?: number; y?: number; width?: number; height?: number }) {
  return (
    <g className="px-chart-crosshair" style={{ transform: `translate(${x + width / 2}px, ${y}px)` }}>
      <line className="px-chart-cursor" x1={0} y1={0} x2={0} y2={height} />
    </g>
  )
}

function ActiveVolume({ onActive }: { onActive: (row: Row | null) => void }) {
  const active = useIsTooltipActive()
  const points = useActiveTooltipDataPoints<Row>()
  const row = active ? (points?.[0] ?? null) : null
  React.useEffect(() => onActive(row), [row, onActive])
  return null
}

function widthOf(texts: string[]) {
  return Math.ceil(Math.max(...texts.map((text) => text.length)) * 7.5) + 12
}

type Scale = ReturnType<typeof scaleFor>

const writer = (locale: string, options: Intl.NumberFormatOptions) => (value: number) => new Intl.NumberFormat(locale, options).format(value).replace(/-/g, MINUS)

const PricePane = React.memo(function PricePane({ rows, kind, fraction, scale, axis, label, sync, timed, locale }: { rows: Row[]; kind: "candle" | "ohlc"; fraction: number; scale: Scale; axis: number; label: string; sync: string; timed: boolean; locale: string }) {
  const digits = { minimumFractionDigits: fraction, maximumFractionDigits: fraction }
  const places = Math.min(scale.places, fraction)
  return (
    <ChartPlot label={chartSummary({ title: label, values: rows.map((row) => row.close), labels: rows.map((row) => row.at), format: writer(locale, digits) })}>
      <ComposedChart data={rows} syncId={sync} barCategoryGap="24%" margin={{ top: 8, right: 24, bottom: timed ? 0 : 8, left: 0 }}>
        <ChartGrid />
        <ChartXAxis dataKey="at" hide={!timed} height={TIME_H} />
        <ChartYAxis domain={scale.domain} ticks={scale.ticks} interval={0} tickFormatter={writer(locale, { minimumFractionDigits: places, maximumFractionDigits: places })} width={axis} allowDataOverflow />
        <Bar dataKey="span" shape={kind === "ohlc" ? OhlcShape : CandleShape} isAnimationActive={false} legendType="none" />
        {(["open", "high", "low", "close"] as const).map((key) => (
          <ChartLine key={key} dataKey={key} name={key[0].toUpperCase() + key.slice(1)} className="px-candle-value" stroke="none" activeDot={false} legendType="none" />
        ))}
        <ChartTooltip format={digits} />
      </ComposedChart>
    </ChartPlot>
  )
})

const VolumePane = React.memo(function VolumePane({ rows, scale, axis, label, sync, onActive }: { rows: Row[]; scale: Scale; axis: number; label: string; sync: string; onActive: (row: Row | null) => void }) {
  return (
    <ChartPlot label={`${label}, volume`} style={{ "--chart-h": `${VOLUME_H + TIME_H}px` } as React.CSSProperties}>
      <BarChart data={rows} syncId={sync} barCategoryGap="24%" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
        <ChartXAxis dataKey="at" height={TIME_H} />
        <ChartYAxis domain={scale.domain} tick={false} width={axis} allowDataOverflow />
        <Bar dataKey="volume" shape={VolumeShape} isAnimationActive={false} legendType="none" />
        <Tooltip cursor={<VolumeCursor />} content={() => null} isAnimationActive={false} wrapperStyle={{ display: "none" }} />
        <ActiveVolume onActive={onActive} />
      </BarChart>
    </ChartPlot>
  )
})

const CandleTable = React.memo(function CandleTable({ rows, volumed, fraction, locale }: { rows: Row[]; volumed: boolean; fraction: number; locale: string }) {
  const price = writer(locale, { minimumFractionDigits: fraction, maximumFractionDigits: fraction })
  const count = writer(locale, { maximumFractionDigits: 0 })
  return (
    <ChartDataTable
      rows={rows}
      caption="Candles table"
      head={(row) => row.at}
      columns={[
        ...(["open", "high", "low", "close"] as const).map((key) => ({ name: key[0].toUpperCase() + key.slice(1), value: (row: Row) => price(row[key]) })),
        ...(volumed ? [{ name: "Volume", value: (row: Row) => count(row.volume ?? 0) }] : []),
      ]}
    />
  )
})

function CandlestickChart({ candles, label, kind = "candle", fraction = 2, range, time = { timeStyle: "short" }, size = "lg", state, children, className, ...props }: CandlestickChartProps) {
  const shown = useFramed(candles, 0).value
  const px = React.useMemo(() => readLocale(), [])
  const sync = React.useId()
  const [hovered, setHovered] = React.useState<Row | null>(null)
  const timeKey = JSON.stringify(time)
  const rows = React.useMemo<Row[]>(() => shown.map((candle) => ({ ...candle, at: formatTime(new Date(candle.time), JSON.parse(timeKey), px), span: [candle.low, candle.high] })), [shown, timeKey, px])
  const volumed = !rows.length || rows.some((row) => row.volume !== undefined)
  const price = useSteadyScale(Math.min(...rows.map((row) => row.low)), Math.max(...rows.map((row) => row.high)), 4)
  const volume = useSteadyScale(0, Math.max(0, ...rows.map((row) => row.volume ?? 0)), 1)
  const places = Math.min(price.places, fraction)
  const axis = widthOf((range ?? price.domain).map(writer(px.locale, { minimumFractionDigits: places, maximumFractionDigits: places })))
  const reading = hovered ?? rows.at(-1)
  const hold = React.useCallback((row: Row | null) => setHovered(row), [])
  const table = <CandleTable rows={rows} volumed={volumed} fraction={fraction} locale={px.locale} />

  if (state || !rows.length)
    return (
      <ChartRoot size={size} data-slot="candlestick-chart" className={className} {...props}>
        <ChartPlot {...(state === "loading" ? { state, label } : { state: state ?? "empty" })} style={{ blockSize: `calc(var(--chart-h) + ${READOUT_H + VOLUME_H + TIME_H}px + 2 * var(--px-space-2))` }}>
          {children}
        </ChartPlot>
        {table}
      </ChartRoot>
    )

  return (
    <ChartRoot
      size={size}
      data-kind={kind}
      data-slot="candlestick-chart"
      className={cn("[&_.px-chart-tip-key]:before:hidden [&_.recharts-xAxis-tick-labels_text]:[direction:ltr] rtl:[&_.recharts-yAxis-tick-labels_text]:[direction:ltr] rtl:[&_.recharts-yAxis-tick-labels_text]:[text-anchor:start] [&_.px-chart-tip>[data-slot=text-morph]]:[unicode-bidi:plaintext] [&_tbody_tr>:first-child]:[unicode-bidi:plaintext]", className)}
      {...props}
    >
      <PricePane rows={rows} kind={kind} fraction={fraction} scale={price} axis={axis} label={label} sync={sync} timed={!volumed} locale={px.locale} />
      {volumed ? (
        <>
          <p className="flex items-baseline gap-2 text-[length:var(--px-text-xs)] font-medium text-muted-foreground" style={{ blockSize: READOUT_H, paddingInlineStart: axis }}>
            Volume
            <span data-slot="candle-volume" className="px-num text-foreground tabular-nums">{writer(px.locale, { maximumFractionDigits: 0 })(reading?.volume ?? 0)}</span>
          </p>
          <VolumePane rows={rows} scale={volume} axis={axis} label={label} sync={sync} onActive={hold} />
        </>
      ) : null}
      {table}
    </ChartRoot>
  )
}

export { CandlestickChart, type Candle, type CandlestickChartProps }
