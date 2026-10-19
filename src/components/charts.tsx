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
