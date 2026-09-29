import * as React from "react"
import {
  Area,
  Bar,
  BarStack,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  Rectangle,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Text,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisDomain,
  useYAxisDomain,
  useYAxisScale,
  type TooltipContentProps,
  type XAxisTickContentProps,
} from "recharts"

import { cn } from "@/lib/utils"
import { MINUS } from "@/lib/format"
import { readLocale } from "@/lib/locale"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { TextMorph } from "@/components/ui/text-morph"
import { useMorph } from "@/hooks/use-morph"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { BarShapeProps, ScatterShapeProps } from "recharts"

/**
 * The PX chart layer on recharts.
 *
 * recharts writes stroke and fill as SVG *presentation attributes*, which any CSS rule outranks.
 * That is the whole adapter: every primitive below carries a .px-chart-* class, the class resolves
 * --chart-line from the PX roles, and a theme change repaints the series with no JavaScript and no
 * re-render. Nothing here names a colour, and nothing per chart overrides one.
 *
 * Series identity travels as data-tone (money: gain, loss, warn) or data-series (the three
 * categorical slots, assigned in fixed order and never cycled; a fourth series folds into "Other"
 * or small multiples). recharts forwards data-* to the
 * rendered SVG node, so the same declaration in components.css serves this renderer and the
 * vanilla one in chart.js.
 */

export type ChartTone = "gain" | "loss" | "warn"
export type ChartSlot = 1 | 2 | 3
type Mark = { tone?: ChartTone; series?: ChartSlot }
type ChartSurface = { role?: string; "aria-label"?: string; "aria-roledescription"?: string; accessibilityLayer?: boolean }

const mark = ({ tone, series }: Mark) => ({ "data-tone": tone, "data-series": series })

/**
 * recharts lays out in physical coordinates, so a mirrored page needs the value axis moved to the
 * inline-start side. Reading the resolved direction is the only way to know: a logical CSS
 * property cannot reach inside a laid-out SVG. The plot reads its own computed direction, so a
 * right-to-left subtree mirrors even when the document around it does not, and hands the answer
 * down, because the axis and tick renderers run inside recharts where no node of ours is in reach.
 * The time scale keeps running earliest to latest, left to right, in both directions.
 */
const ChartDirection = React.createContext(false)

const useRtl = () => React.useContext(ChartDirection)

const ChartReading = React.createContext<{ speak: (text: string) => void; marks: Map<unknown, Mark>; y?: unknown }>({ speak: () => {}, marks: new Map() })

function usePlotDirection(plot: React.RefObject<HTMLElement | null>) {
  const [rtl, setRtl] = React.useState(false)
  React.useEffect(() => {
    const read = () => plot.current && setRtl(getComputedStyle(plot.current).direction === "rtl")
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributeFilter: ["dir", "style"], subtree: true })
    return () => observer.disconnect()
  }, [plot])
  return rtl
}

function ChartRoot({
  size,
  className,
  ...props
}: React.ComponentProps<"figure"> & { size?: "sm" | "lg" }) {
  return <figure data-size={size} className={cn("px-chart", className)} {...props} />
}

/**
 * The plot box. A chart with nothing to draw keeps this box and holds a state primitive instead
 * of a drawing, so the page does not reflow between loading, empty, and drawn — pass `state` and
 * render the #9 skeleton or state block as children. The skeleton is aria-hidden and a status
 * region's `aria-label` goes unread, so a loading plot names itself with `label` as hidden text.
 * A drawn plot names its SVG with `label` as one `role="img"`, the node the vanilla renderer
 * writes. A plot holding a `ChartTooltip` is instead one tab stop, a named chart the arrow keys
 * walk point by point, and the point they land on is said once through the plot's live region.
 */
function ChartPlot({
  state,
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  ({ state?: "loading"; label: string } | { state: "empty" | "error"; label?: undefined })) {
  const plot = React.useRef<HTMLDivElement>(null)
  const rtl = usePlotDirection(plot)
  const [spoken, speak] = React.useState("")
  const chart = children as React.ReactElement<ChartSurface & { children?: React.ReactNode }>
  const parts = React.Children.toArray(chart.props.children).filter(React.isValidElement) as React.ReactElement<Mark & { dataKey?: unknown }>[]
  const explored = !state && parts.some((part) => part.type === ChartTooltip)
  const marks = new Map(parts.filter((part) => [ChartLine, ChartArea, ChartBar].includes(part.type as never)).map((part) => [part.props.dataKey, { tone: part.props.tone, series: part.props.series }]))
  return (
    <div
      data-state={state}
      role={state === "error" ? "alert" : state === "loading" ? "status" : undefined}
      className={cn("px-chart-plot", className)}
      {...props}
      ref={plot}
    >
      {state === "loading" ? <span className="sr-only">{label}</span> : null}
      {state ? (
        children
      ) : (
        <ChartDirection.Provider value={rtl}>
          <ChartReading.Provider value={{ speak, marks, y: parts.find((part) => part.type === ChartYAxis)?.props.dataKey }}>
            <ResponsiveContainer>
              {React.cloneElement(chart, {
                role: explored ? "application" : "img",
                "aria-roledescription": explored ? "chart" : undefined,
                "aria-label": label,
                accessibilityLayer: explored,
              })}
            </ResponsiveContainer>
            {explored ? (
              <span aria-live="polite" data-slot="chart-live" className="sr-only">
                {spoken}
              </span>
            ) : null}
          </ChartReading.Provider>
        </ChartDirection.Provider>
      )}
    </div>
  )
}

/** The summary sentence a drawn plot is named with; the vanilla renderer speaks the same one. */
function chartSummary({
  title,
  values,
  labels,
  format = String,
}: {
  title: string
  values: number[]
  labels?: string[]
  format?: (value: number) => string
}) {
  if (!values.length) return title
  const max = Math.max(...values)
  const min = Math.min(...values)
  const on = (value: number) => {
    const label = labels?.[values.indexOf(value)]
    return label ? ` on ${label}` : ""
  }
  return (
    `${title}. ${values.length} points from ${format(values[0])} to ${format(values[values.length - 1])}, ` +
    `high ${format(max)}${on(max)}, low ${format(min)}${on(min)}.`
  )
}

/** Horizontal rules only: a vertical grid competes with the marks and adds nothing a tick does not. */
function ChartGrid(props: React.ComponentProps<typeof CartesianGrid>) {
  return <CartesianGrid className="px-chart-grid" vertical={false} strokeDasharray="" {...props} />
}

function ChartXTick({
  className,
  index,
  orientation,
  padding,
  payload,
  tickFormatter,
  visibleTicksCount,
  ...props
}: XAxisTickContentProps) {
  const rtl = useRtl()
  const plot = usePlotArea()
  const atStart = plot != null && payload.coordinate <= plot.x
  const atEnd = plot != null && payload.coordinate >= plot.x + plot.width
  return (
    <Text
      {...props}
      x={plot && atStart ? plot.x : plot && atEnd ? plot.x + plot.width : props.x}
      textAnchor={atStart ? (rtl ? "end" : "start") : atEnd ? (rtl ? "start" : "end") : props.textAnchor}
      className={cn("px-chart-tick", className)}
    >
      {tickFormatter ? tickFormatter(payload.value, index) : payload.value}
    </Text>
  )
}

/**
 * Axes carry no line of their own — the grid already states the scale, and a second rule around
 * the plot is a box the data has to fight. Ticks are round values, capped in count, and wear
 * --chart-tick, a 4.5:1 text role, because a tick label is small text a reader must resolve.
 */
function ChartXAxis(props: React.ComponentProps<typeof XAxis>) {
  return (
    <XAxis
      axisLine={false}
      tickLine={false}
      tickMargin={8}
      minTickGap={24}
      tick={(tick) => <ChartXTick {...tick} />}
      {...props}
    />
  )
}

function ChartYAxis(props: React.ComponentProps<typeof YAxis>) {
  const rtl = useRtl()
  return (
    <YAxis
      orientation={rtl ? "right" : "left"}
      axisLine={false}
      tickLine={false}
      tickCount={4}
      width={48}
      tick={rtl ? { className: "px-chart-tick", textAnchor: "end" } : { className: "px-chart-tick" }}
      {...props}
    />
  )
}

/**
 * A series. `dot` and the entry tween are off by default: recharts 3.10.1 defaults to a rendered
 * dot per point and a 1500 ms animation, which is a frame budget spent redrawing a line the
 * reader has already read, and on a streaming series it is a tween between two live values.
 */
function ChartLine({
  tone,
  series,
  ...props
}: React.ComponentProps<typeof Line> & Mark) {
  return (
    <Line
      className="px-chart-line"
      {...mark({ tone, series })}
      type="linear"
      dot={false}
      activeDot={{ className: "px-chart-point", r: 4, ...mark({ tone, series }) }}
      isAnimationActive={false}
      {...props}
    />
  )
}

/** A line with a wash under it. Areas that share a `stackId` stack, and each band keeps its own line. */
function ChartArea({ tone, series, ...props }: React.ComponentProps<typeof Area> & Mark) {
  return (
    <Area
      className={cn("px-chart-area", props.stackId !== undefined && "px-chart-stacked")}
      {...mark({ tone, series })}
      type="linear"
      dot={false}
      activeDot={{ className: "px-chart-point", r: 4, ...mark({ tone, series }) }}
      isAnimationActive={false}
      {...props}
    />
  )
}

const Stacked = React.createContext(false)

function StackSegment({ y = 0, height = 0, background, ...props }: BarShapeProps) {
  const floor = background ? (background.y ?? 0) + (background.height ?? 0) : y + height
  return <Rectangle {...props} y={y} height={y + height < floor - 0.5 ? Math.max(0, height - 2) : height} />
}

/** A bar. Only the data end is rounded, so the mark stays anchored to the zero baseline instead
 *  of floating on a pill, and a category keeps the gap that separates it from its neighbour. */
function ChartBar({ tone, series, ...props }: React.ComponentProps<typeof Bar> & Mark) {
  const stacked = React.useContext(Stacked)
  return (
    <Bar
      className="px-chart-bar"
      {...mark({ tone, series })}
      radius={stacked ? 0 : [4, 4, 0, 0]}
      shape={stacked ? StackSegment : undefined}
      isAnimationActive={false}
      {...props}
    />
  )
}

function ChartBarStack(props: Omit<React.ComponentProps<typeof BarStack>, "radius">) {
  return (
    <Stacked.Provider value>
      <BarStack radius={[4, 4, 0, 0]} {...props} />
    </Stacked.Provider>
  )
}

function ScatterDot({ cx = 0, cy = 0, ...marked }: Pick<ScatterShapeProps, "cx" | "cy"> & Mark) {
  return (
    <g {...mark(marked)}>
      <circle className="px-chart-hit" cx={cx} cy={cy} r={12} />
      <circle className="px-chart-point" cx={cx} cy={cy} r={4} />
    </g>
  )
}

function ChartScatter({ tone, series, ...props }: React.ComponentProps<typeof Scatter> & Mark) {
  return <Scatter className="px-chart-scatter" {...mark({ tone, series })} shape={(dot: ScatterShapeProps) => <ScatterDot cx={dot.cx} cy={dot.cy} tone={tone} series={series} />} isAnimationActive={false} {...props} />
}

export type ChartSlice = { name: string; value: number; series?: ChartSlot }

function ChartDonut({
  label,
  slices,
  total = "Total",
  format,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: string
  slices: ChartSlice[]
  total?: string
  format?: React.ComponentProps<typeof AnimatedNumber>["format"]
}) {
  const [active, setActive] = React.useState<number | null>(null)
  const sum = slices.reduce((all, slice) => all + slice.value, 0)
  const named = active === null || !slices[active] ? 0 : active + 1
  const names = [total, ...slices.map((slice) => slice.name)]
  const written = { minimumFractionDigits: 0, maximumFractionDigits: 0, ...format }
  const share = { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 0 } as const
  return (
    <div data-slot="chart-donut" className={cn("px-chart-donut", className)} {...props}>
      <ChartPlot label={label}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            stroke="none"
            isAnimationActive={false}
            rootTabIndex={-1}
            onMouseEnter={(_, index) => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            {slices.map((slice, index) => (
              <Cell
                key={slice.name}
                className="px-chart-slice"
                {...mark({ series: slice.series })}
                data-dim={active !== null && active !== index ? "" : undefined}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartPlot>
      <div data-slot="chart-donut-centre" className="px-chart-centre">
        <AnimatedNumber value={named ? slices[named - 1].value : sum} format={written} widest={sum} tint={false} />
        <span className="px-chart-centre-name">
          {names.map((name, index) => (
            <span key={index} data-shown={index === named ? "" : undefined} aria-hidden={index !== named || undefined}>
              {name}
            </span>
          ))}
        </span>
      </div>
      <ul className="px-chart-legend" data-slot="chart-donut-legend">
        {slices.map((slice) => (
          <li key={slice.name}>
            <span className="px-chart-swatch" {...mark({ series: slice.series })} />
            {slice.name}
            <AnimatedNumber value={slice.value} format={written} widest={sum} tint={false} />
            <AnimatedNumber value={sum ? slice.value / sum : 0} format={share} widest={1} tint={false} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChartReferenceLine({
  tone,
  series,
  ...props
}: React.ComponentProps<typeof ReferenceLine> & Mark) {
  return <ReferenceLine className="px-chart-ref" {...mark({ tone, series })} {...props} />
}

function ChartReferenceBand({
  tone,
  series,
  ...props
}: React.ComponentProps<typeof ReferenceArea> & Mark) {
  return <ReferenceArea className="px-chart-band" {...mark({ tone, series })} {...props} />
}

/** An annotation: the marked point plus its label, both in the tone of what happened there. */
function ChartAnnotation({
  tone,
  series,
  label,
  ...props
}: React.ComponentProps<typeof ReferenceDot> & Mark & { label?: string }) {
  return (
    <ReferenceDot
      className="px-chart-point"
      {...mark({ tone, series })}
      r={5}
      label={label ? { value: label, position: "top", className: "px-chart-label" } : undefined}
      {...props}
    />
  )
}

function ChartCursor({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  points,
}: {
  x?: number
  y?: number
  width?: number
  height?: number
  points?: { x: number; y: number }[]
}) {
  const [from, to] = points ?? []
  const at = from ?? { x, y }
  return (
    <g className="px-chart-crosshair" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      {from && to ? (
        <line className="px-chart-cursor" x1={0} y1={0} x2={to.x - from.x} y2={to.y - from.y} />
      ) : (
        <rect className="px-chart-cursor" x={0} y={0} width={width} height={height} />
      )}
    </g>
  )
}

type ChartFormat = NonNullable<React.ComponentProps<typeof AnimatedNumber>["format"]>

const writers = new Map<string, Intl.NumberFormat>()

function writer(locale: string, options: ChartFormat) {
  const key = JSON.stringify([locale, options])
  let write = writers.get(key)
  if (!write) writers.set(key, (write = new Intl.NumberFormat(locale, options)))
  return write
}

function ChartTooltipContent({
  active,
  payload,
  label: point,
  labelFormatter,
  coordinate,
  format,
}: Partial<TooltipContentProps> & { format?: ChartFormat }) {
  const rtl = useRtl()
  const plot = usePlotArea()
  const scale = useYAxisScale()
  const bounds = useYAxisDomain()
  const labels = useXAxisDomain()
  const { speak, marks, y } = React.useContext(ChartReading)
  const { timing } = useMorph({ spring: "snappy" })
  const anchor = React.useRef<HTMLDivElement>(null)
  const locale = React.useMemo(() => readLocale().locale, [])
  const label = labelFormatter && payload ? labelFormatter(point, payload) : point
  const options = { minimumFractionDigits: 0, maximumFractionDigits: 2, ...format }
  const write = writer(locale, options)
  const entries = active && coordinate && plot ? (payload ?? []).filter((entry) => typeof entry.value === "number") : []
  const said = entries.length ? `${label}: ${entries.map((entry) => `${entry.name ?? ""} ${write.format(Number(entry.value)).replace(/-/g, MINUS)}`.trim()).join(", ")}` : ""

  const saying = React.useRef(said)
  saying.current = said
  const under = entries.length ? String(label) : ""
  React.useEffect(() => {
    if (under && anchor.current?.closest(".px-chart-plot")?.contains(document.activeElement)) speak(saying.current)
  }, [under, speak])

  if (!entries.length || !coordinate || !plot) return null
  const tops = entries.filter((entry) => y === undefined || entry.dataKey === y).map((entry) => scale?.(Number(entry.value))).filter((top): top is number => typeof top === "number")
  const top = Math.max(plot.y, Math.min(...tops, plot.y + plot.height))
  const along = (coordinate.x - plot.x) / (plot.width || 1)
  const reading = rtl ? 1 - along : along
  const flip = reading < 0.15 ? 0 : reading > 0.85 ? -1 : -0.5
  const widest = bounds?.every((bound) => typeof bound === "number") ? (bounds as number[]) : undefined
  const reserve = labels?.every((one) => typeof one === "string") ? (labels as string[]) : undefined

  return (
    <div ref={anchor} data-slot="chart-tip-anchor" className="px-chart-anchor" style={{ transform: `translate(${coordinate.x}px, ${top}px)` }}>
      <div key={timing?.duration === 0 ? String(label) : undefined} className="px-chart-tip" data-open="" style={{ "--tip-x": "0px", "--tip-flip": String(flip) } as React.CSSProperties}>
        <TextMorph reserve={reserve}>{String(label)}</TextMorph>
        {entries.map((entry) => (
          <React.Fragment key={String(entry.dataKey)}>
            <span className="px-chart-tip-key" {...mark(marks.get(entry.dataKey) ?? {})}>
              {entry.name ?? String(entry.dataKey)}
            </span>
            <b>
              <AnimatedNumber value={Number(entry.value)} format={options} locales={locale} tint={false} widest={widest} />
            </b>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * The crosshair tooltip. It follows the pointer over the whole plot rather than asking a reader
 * to hit a 2px line, and the arrow keys walk it point by point once the plot has focus. The
 * crosshair and the tooltip glide between points and the values roll, all on the snappy spring,
 * and reduced motion lands each on its point in one frame. `format` is the Intl number format the
 * values are written and rolled in. The exact values still live in the data table.
 */
function ChartTooltip({
  format,
  ...props
}: Omit<React.ComponentProps<typeof Tooltip>, "content" | "cursor"> & { format?: ChartFormat }) {
  return (
    <Tooltip
      cursor={<ChartCursor />}
      isAnimationActive={false}
      position={{ x: 0, y: 0 }}
      wrapperStyle={{ outline: "none" }}
      content={<ChartTooltipContent format={format} />}
      {...props}
    />
  )
}

/** Two series or more are always named here, so identity is never colour alone. */
function ChartLegend(props: React.ComponentProps<typeof Legend>) {
  return (
    <Legend
      verticalAlign="bottom"
      content={({ payload }) => (
        <ul className="px-chart-legend">
          {payload?.map((entry) => {
            const props = entry.payload as Record<string, unknown> | undefined
            return (
              <li key={String(entry.dataKey ?? entry.value)}>
                <span
                  className="px-chart-swatch"
                  data-tone={props?.["data-tone"] as ChartTone | undefined}
                  data-series={props?.["data-series"] as ChartSlot | undefined}
                />
                {entry.value}
              </li>
            )
          })}
        </ul>
      )}
      {...props}
    />
  )
}

/**
 * The accessible route. A chart is not reachable as a picture, and in a trading journal the
 * numbers *are* the content — a spoken summary loses them and focusable points would put
 * hundreds of tab stops between a reader and the next control. So the drawing is one role="img"
 * node with a one-line summary, and the values ship as a real table one keystroke away.
 */
function ChartDataTable<T>({
  rows,
  columns,
  caption = "Data table",
  head,
}: {
  rows: T[]
  columns: { name: string; value: (row: T) => React.ReactNode }[]
  caption?: string
  head: (row: T, index: number) => React.ReactNode
}) {
  return (
    <details className="px-chart-data">
      <summary>{caption}</summary>
      <Table label={caption} containerClassName="mt-2">
        <TableHeader>
          <TableRow>
            <TableHead>Point</TableHead>
            {columns.map((column) => (
              <TableHead align="end" key={column.name}>
                {column.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell scope="row">{head(row, index)}</TableCell>
              {columns.map((column) => (
                <TableCell align="end" className="px-num" key={column.name}>
                  {column.value(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  )
}

/**
 * A sparkline answers "which way" and nothing else, so it is drawn directly rather than through
 * recharts: at 88x24 a responsive container, an axis pass, and a tooltip layer all cost more than
 * the path they wrap. It is aria-hidden because the cell beside it already carries the number.
 * 48px of inline size is the floor where the shape still reads.
 */
function Sparkline({
  values,
  tone,
  width = 88,
  height = 24,
  dot = true,
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "values" | "width" | "height"> & {
  values: number[]
  tone?: ChartTone
  width?: number
  height?: number
  dot?: boolean
}) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (width - 4) + 2
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = "M" + values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L")
  return (
    <svg
      className={cn("px-sparkline", className)}
      data-tone={tone}
      viewBox={`0 0 ${width} ${height}`}
      style={{ "--spark-w": `${width}px`, "--spark-h": `${height}px` } as React.CSSProperties}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={d} />
      {dot ? <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2} /> : null}
    </svg>
  )
}

export {
  ChartRoot,
  ChartPlot,
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
  ChartLine,
  ChartArea,
  ChartBar,
  ChartBarStack,
  ChartScatter,
  ChartDonut,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  ChartReferenceLine,
  ChartReferenceBand,
  ChartAnnotation,
  ChartDataTable,
  Sparkline,
  chartSummary,
}
