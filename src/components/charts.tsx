import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { tokens } from '../theme'

/** The width of a box, kept up to date as it resizes (charts draw to it). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** A round top for the axis: 1, 2, 2.5 or 5 times a power of ten, at or above the biggest value. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find(m => m * p >= v) ?? 10) * p
}

export interface BarPoint {
  /** Under the bar (thinned out when there are many). */
  label: string
  /** At the top of the tooltip, e.g. the full date. */
  title: string
  value: number
  /** The same point in the period it's compared with (drawn as a grey line). */
  prev?: number
}

/**
 * Bars for one measure, with an optional earlier period as a thin grey line over them. Hover, tap or
 * use the arrow keys for each bar's figures. One series is named by the card's title; with an
 * earlier period a legend names both.
 */
export function BarChart({ points, format, axisFormat = format, label, current, previous, height = 220 }: {
  points: BarPoint[]
  format: (n: number) => string
  /** Shorter figures for the axis (e.g. no cents). */
  axisFormat?: (n: number) => string
  /** What the chart shows, for screen readers. */
  label: string
  /** Legend names, shown when there's an earlier period. */
  current?: string
  previous?: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = points.length
  const compare = points.some(p => p.prev !== undefined)
  const top = 12, bottom = 26
  const max = niceMax(Math.max(0, ...points.map(p => Math.max(p.value, p.prev ?? 0))))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const left = Math.max(28, ...ticks.map(t => axisFormat(t).length * 6.4 + 10)), right = 8
  const plotW = Math.max(0, width - left - right), plotH = height - top - bottom
  const band = n ? plotW / n : 0
  const barW = Math.max(2, Math.min(36, band - 2, band * 0.72))
  const cx = (i: number) => left + band * i + band / 2
  const y = (v: number) => top + plotH - (v / max) * plotH
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))))
  const prevPath = compare
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${y(p.prev ?? 0)}`).join('')
    : ''
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) / Math.max(1, box.width)) * n))))
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setHover(h => Math.max(0, Math.min(n - 1, (h ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))))
    }
  }
  const at = hover !== null && hover < n ? points[hover] : null
  const tipW = 190
  return (
    <Box>
      {compare && current && previous && (
        <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: 'wrap' }} aria-hidden>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: tokens.chart }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{current}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 0, borderTop: `2px dashed ${tokens.inkSoft}` }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{previous}</Typography>
          </Stack>
        </Stack>
      )}
      <Box ref={ref} sx={{ position: 'relative', width: '100%' }}>
        {width > 0 && (
          <Box component="svg" width={width} height={height} role="img" tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} aria-label={label}
            sx={{ display: 'block', outline: 'none', '&:focus-visible': { outline: `2px solid ${tokens.rose}`, borderRadius: '8px' } }}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={tokens.line} strokeWidth={1} />
                <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={tokens.inkFaint}>{axisFormat(t)}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const h = Math.max(0, y(0) - y(p.value))
              const r = Math.min(4, barW / 2, h)
              const x0 = cx(i) - barW / 2, y0 = y(p.value)
              // Rounded at the top only: the bar stands on the baseline.
              const d = h <= 0 ? '' : `M${x0},${y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${y(0)}Z`
              return d ? <path key={i} d={d} fill={hover === i ? tokens.chartHover : tokens.chart} fillOpacity={hover === null || hover === i ? 1 : 0.6} /> : null
            })}
            {compare && (
              <g pointerEvents="none">
                <path d={prevPath} fill="none" stroke={tokens.inkSoft} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
                {n <= 31 && points.map((p, i) => <circle key={i} cx={cx(i)} cy={y(p.prev ?? 0)} r={hover === i ? 4.5 : 2.5} fill={tokens.inkSoft} stroke={tokens.surface} strokeWidth={1.5} />)}
              </g>
            )}
            {points.map((p, i) => (i % tickEvery === 0 ? (
              <text key={i} x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={hover === i ? tokens.ink : tokens.inkFaint}>{p.label}</text>
            ) : null))}
            <rect x={left} y={top} width={plotW} height={plotH + bottom} fill="transparent"
              onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
          </Box>
        )}
        {at && width > 0 && (
          <Box role="status" sx={{ position: 'absolute', top: 0, left: Math.min(Math.max(0, cx(hover!) - tipW / 2), width - tipW), width: tipW, pointerEvents: 'none',
            bgcolor: tokens.surface, border: `1px solid ${tokens.line}`, borderRadius: '10px', boxShadow: `0 8px 24px -12px ${tokens.shadow}`, p: 1.25 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{at.title}</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: tokens.chart, flexShrink: 0 }} />
              <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{format(at.value)}</Typography>
            </Stack>
            {at.prev !== undefined && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 0, borderTop: `2px dashed ${tokens.inkSoft}`, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{format(at.prev)}{previous ? ` ${previous.toLowerCase()}` : ''}</Typography>
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** A ranked list of shares as thin horizontal bars: name, amount and its share of the whole. */
export function ShareBars({ rows, format, label }: { rows: { name: string; value: number }[]; format: (n: number) => string; label: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <Stack component="ul" aria-label={label} spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map(r => {
        const share = total > 0 ? r.value / total : 0
        return (
          <Box component="li" key={r.name}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="body2">{r.name}</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(r.value)} <Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>{Math.round(share * 100)}%</Box>
              </Typography>
            </Stack>
            <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: tokens.line, overflow: 'hidden' }}>
              <Box sx={{ width: `${Math.max(share > 0 ? 1.5 : 0, share * 100)}%`, height: '100%', borderRadius: 3, bgcolor: tokens.chart }} />
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

export interface MapPoint {
  id: string
  /** Its name, at the top of the tooltip. */
  label: string
  x: number
  y: number
  /** Drawn bigger the more it has (e.g. reviews). */
  size?: number
  /** The business itself: its own colour, and named beside its dot before any other. */
  you?: boolean
  /** More lines for the tooltip. */
  details?: string[]
}

/** A round step for an axis between lo and hi (1, 2, 2.5 or 5 times a power of ten), about `count` of them. */
function niceStep(lo: number, hi: number, count: number) {
  const raw = (hi - lo) / Math.max(1, count)
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  return ([1, 2, 2.5, 5, 10].find(m => m * p >= raw) ?? 10) * p
}
const ticksOf = (lo: number, hi: number, step: number) => {
  const out: number[] = []
  for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}

/**
 * Places on two measures (price against the area, Google rating), with dashed guides at the
 * averages. The business is drawn in its own colour; the rest share one, with a legend; each is named
 * beside its dot where the name fits. Hover, tap or use the arrow keys for each one's figures (the
 * page has the same as a table).
 */
export function ScatterChart({ points, xFormat, yFormat, xLabel, yLabel, xGuide, yGuide, label, legend, height = 300 }: {
  points: MapPoint[]
  xFormat: (n: number) => string
  yFormat: (n: number) => string
  /** What each axis measures. */
  xLabel: string
  yLabel: string
  /** Dashed lines across, e.g. at the average, with what they are. */
  xGuide?: { value: number; label: string }
  yGuide?: { value: number; label: string }
  /** What the chart shows, for screen readers. */
  label: string
  legend: { them: string; you: string; size?: string }
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const top = 22, bottom = 40, right = 16
  const xs = [...points.map(p => p.x), ...(xGuide ? [xGuide.value] : [])], ys = [...points.map(p => p.y), ...(yGuide ? [yGuide.value] : [])]
  // Each axis padded a little past its points and guides, then out to round steps.
  const pad = (lo: number, hi: number, min: number) => { const r = Math.max(min, hi - lo); return [lo - r * 0.12, hi + r * 0.12] as const }
  const [xa, xb] = xs.length ? pad(Math.min(...xs), Math.max(...xs), 20) : [80, 120]
  const [ya, yb] = ys.length ? pad(Math.min(...ys), Math.max(...ys), 0.6) : [3.5, 5]
  const xStep = niceStep(xa, xb, Math.max(2, Math.floor((width || 300) / 90))), yStep = niceStep(ya, yb, 4)
  const x0 = Math.floor(xa / xStep) * xStep, x1 = Math.ceil(xb / xStep) * xStep
  const y0 = Math.max(0, Math.floor(ya / yStep) * yStep), y1 = Math.max(y0 + yStep, Math.ceil(yb / yStep) * yStep)
  const yTicks = ticksOf(y0, y1, yStep), xTicks = ticksOf(x0, x1, xStep)
  const left = Math.max(32, ...yTicks.map(v => yFormat(v).length * 6.4 + 12))
  const plotW = Math.max(0, width - left - right), plotH = height - top - bottom
  const px = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * plotW
  const py = (v: number) => top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH
  const most = Math.max(1, ...points.map(p => p.size ?? 0))
  const radius = (p: MapPoint) => (p.size === undefined ? 6 : 5 + 6 * Math.sqrt(Math.max(0, p.size) / most))
  // Big dots first so small ones stay on top; the business last of all.
  const order = points.map((_, i) => i).sort((a, b) => Number(!!points[a].you) - Number(!!points[b].you) || radius(points[b]) - radius(points[a]))
  const byX = points.map((_, i) => i).sort((a, b) => points[a].x - points[b].x)
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const mx = left + e.clientX - box.left, my = top + e.clientY - box.top
    let best: number | null = null, dist = 32
    points.forEach((p, i) => { const d = Math.hypot(px(p.x) - mx, py(p.y) - my); if (d < dist) { dist = d; best = i } })
    setHover(best)
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const at = hover === null ? -1 : byX.indexOf(hover)
    const next = e.key === 'ArrowRight' ? Math.min(byX.length - 1, at + 1) : Math.max(0, at === -1 ? byX.length - 1 : at - 1)
    setHover(byX[next] ?? null)
  }
  // Names beside the dots where they fit: the business first, then the biggest; one that would sit on
  // another name or dot goes without (its tooltip and the table beside the chart still have it).
  const labels: { i: number; x: number; y: number; anchor: 'start' | 'end' | 'middle' }[] = []
  if (width > 0) {
    const boxes: [number, number, number, number][] = points.map(p => {
      const r = radius(p)
      return [px(p.x) - r, py(p.y) - r, px(p.x) + r, py(p.y) + r]
    })
    const hits = (b: [number, number, number, number], own: number) => b[0] < left || b[2] > left + plotW || b[1] < top || b[3] > top + plotH
      || boxes.some((o, k) => k !== own && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
    const byImportance = points.map((_, i) => i).sort((a, b) => Number(!!points[b].you) - Number(!!points[a].you) || radius(points[b]) - radius(points[a]))
    for (const i of byImportance) {
      const p = points[i], r = radius(p), cx = px(p.x), cy = py(p.y), w = p.label.length * (p.you ? 7.2 : 6.4) + 2
      const tries: [typeof labels[number], [number, number, number, number]][] = [
        [{ i, x: cx + r + 5, y: cy + 4, anchor: 'start' }, [cx + r + 5, cy - 9, cx + r + 5 + w, cy + 5]],
        [{ i, x: cx - r - 5, y: cy + 4, anchor: 'end' }, [cx - r - 5 - w, cy - 9, cx - r - 5, cy + 5]],
        [{ i, x: cx, y: cy - r - 6, anchor: 'middle' }, [cx - w / 2, cy - r - 19, cx + w / 2, cy - r - 5]],
      ]
      const fit = tries.find(([, b]) => !hits(b, i))
      if (fit) { labels.push(fit[0]); boxes.push(fit[1]) }
    }
  }
  const at = hover !== null ? points[hover] : null
  const tipW = 210
  const swatch = (colour: string) => <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colour, flexShrink: 0 }} />
  return (
    <Box>
      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 1, flexWrap: 'wrap' }} aria-hidden>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>{swatch(tokens.chartYou)}<Typography variant="caption" sx={{ color: 'text.secondary' }}>{legend.you}</Typography></Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>{swatch(tokens.chartThem)}<Typography variant="caption" sx={{ color: 'text.secondary' }}>{legend.them}</Typography></Stack>
        {legend.size && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{legend.size}</Typography>}
      </Stack>
      <Box ref={ref} sx={{ position: 'relative', width: '100%' }}>
        {width > 0 && (
          <Box component="svg" width={width} height={height} role="img" tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)} aria-label={label}
            sx={{ display: 'block', outline: 'none', '&:focus-visible': { outline: `2px solid ${tokens.rose}`, borderRadius: '8px' } }}>
            {yTicks.map(v => (
              <g key={`y${v}`}>
                <line x1={left} x2={left + plotW} y1={py(v)} y2={py(v)} stroke={tokens.line} strokeWidth={1} />
                <text x={left - 8} y={py(v) + 4} textAnchor="end" fontSize={11} fill={tokens.inkFaint}>{yFormat(v)}</text>
              </g>
            ))}
            {xTicks.map(v => (
              <text key={`x${v}`} x={px(v)} y={top + plotH + 16} textAnchor="middle" fontSize={11} fill={tokens.inkFaint}>{xFormat(v)}</text>
            ))}
            <text x={left + plotW} y={height - 4} textAnchor="end" fontSize={11} fill={tokens.inkSoft}>{xLabel}</text>
            <text x={left} y={11} textAnchor="start" fontSize={11} fill={tokens.inkSoft}>{yLabel}</text>
            {xGuide && (
              <g>
                <line x1={px(xGuide.value)} x2={px(xGuide.value)} y1={top} y2={top + plotH} stroke={tokens.inkFaint} strokeWidth={1} strokeDasharray="4 3" />
                <text x={px(xGuide.value) + 4} y={top + 10} fontSize={10} fill={tokens.inkFaint}>{xGuide.label}</text>
              </g>
            )}
            {yGuide && (
              <g>
                <line x1={left} x2={left + plotW} y1={py(yGuide.value)} y2={py(yGuide.value)} stroke={tokens.inkFaint} strokeWidth={1} strokeDasharray="4 3" />
                <text x={left + plotW} y={py(yGuide.value) - 4} textAnchor="end" fontSize={10} fill={tokens.inkFaint}>{yGuide.label}</text>
              </g>
            )}
            {order.map(i => {
              const p = points[i]
              return <circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={radius(p) + (hover === i ? 1.5 : 0)} fill={p.you ? tokens.chartYou : tokens.chartThem}
                fillOpacity={hover === null || hover === i ? 1 : 0.55} stroke={tokens.surface} strokeWidth={2} />
            })}
            {labels.map(l => (
              <text key={`name-${points[l.i].id}`} x={l.x} y={l.y} textAnchor={l.anchor} pointerEvents="none"
                fontSize={points[l.i].you ? 12 : 11} fontWeight={points[l.i].you ? 600 : 400} fill={points[l.i].you ? tokens.ink : tokens.inkSoft}>{points[l.i].label}</text>
            ))}
            <rect x={left} y={top} width={plotW} height={plotH} fill="transparent"
              onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
          </Box>
        )}
        {at && width > 0 && (
          <Box role="status" sx={{ position: 'absolute', top: Math.max(0, py(at.y) - 96), left: Math.min(Math.max(0, px(at.x) - tipW / 2), width - tipW), width: tipW,
            pointerEvents: 'none', bgcolor: tokens.surface, border: `1px solid ${tokens.line}`, borderRadius: '10px', boxShadow: `0 8px 24px -12px ${tokens.shadow}`, p: 1.25 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {swatch(at.you ? tokens.chartYou : tokens.chartThem)}
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{at.label}</Typography>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {xLabel}: {xFormat(at.x)} · {yLabel}: {yFormat(at.y)}
            </Typography>
            {at.details?.map(d => <Typography key={d} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{d}</Typography>)}
          </Box>
        )}
      </Box>
    </Box>
  )
}
