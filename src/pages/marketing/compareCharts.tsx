// The Compare page's charts, drawn in the site's own look: lines over time (what each route has cost,
// the learning curve) with a legend, a crosshair and each line's figure at that point, by pointer or
// the arrow keys; and the figures as a table under each, for anyone who'd rather read them.
// Colours: one per product, the same on every chart, checked for colour-blind readers on white.
import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ProductId } from '../../../shared/compare'
import { t } from '../../i18n'
import { BA } from './site'

/** Each product's colour on the charts (rose for us, lilac and ochre for the others). */
export const PRODUCT_COLOR: Record<ProductId, string> = { business_agent: '#B4475F', square: '#6A55B8', gohighlevel: '#C7862A' }

export interface Series { id: ProductId; name: string; values: number[] }

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

/** A round top for the axis, at or above the biggest value and close to it (so the lines use the height). */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find(m => m * p >= v) ?? 10) * p
}

/** The products' names with their colour, above a chart. */
export function Legend({ series }: { series: Series[] }) {
  return (
    <Stack direction="row" component="ul" aria-label={t('Legend')} sx={{ listStyle: 'none', m: 0, p: 0, flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.75 }}>
      {series.map(s => (
        <Stack key={s.id} component="li" direction="row" spacing={0.9} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 16, height: 0, borderTop: `3px solid ${PRODUCT_COLOR[s.id]}`, borderRadius: 2 }} />
          <Typography sx={{ fontSize: '0.9rem', color: BA.soft, fontWeight: s.id === 'business_agent' ? 600 : 400 }}>{s.name}</Typography>
        </Stack>
      ))}
    </Stack>
  )
}

/**
 * Lines that share one x axis (months, weeks): a hairline grid, each line 2px, a dot at its last point
 * with the value beside it when the ends don't crowd each other, and a `guide` line across (e.g. 80%).
 */
export function LineChart({ series, xLabel, xTicks, format, axisFormat = format, label, height = 300, max, guide, endLabels }: {
  series: Series[]
  /** The x position in words, at the top of the tooltip ("Month 12"). */
  xLabel: (i: number) => string
  /** Which positions get a label under the axis, and what it says. */
  xTicks: { at: number; text: string }[]
  format: (n: number) => string
  axisFormat?: (n: number) => string
  /** What the chart shows, for screen readers. */
  label: string
  height?: number
  /** The top of the axis (otherwise a round number above the biggest value). */
  max?: number
  guide?: { value: number; text: string }
  /** Each line's last value at its end. */
  endLabels?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(...series.map(s => s.values.length))
  const top = 14, bottom = 28
  const yMax = max ?? niceMax(Math.max(0, ...series.flatMap(s => s.values)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax)
  const left = Math.max(30, ...ticks.map(v => axisFormat(v).length * 6.6 + 12))
  const right = endLabels ? Math.max(16, ...series.map(s => format(s.values[s.values.length - 1]).length * 7.4 + 18)) : 14
  const plotW = Math.max(0, width - left - right), plotH = height - top - bottom
  const x = (i: number) => left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = (v: number) => top + plotH - (v / yMax) * plotH
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  // End labels only where they don't crowd: lines that end close together are named by the legend and the tooltip.
  const ends = series.map(s => y(s.values[s.values.length - 1])).sort((a, b) => a - b)
  const roomy = endLabels && ends.every((e, i) => !i || e - ends[i - 1] >= 18)
  // Axis labels that fit: thinned out on a narrow screen, keeping the first and the last.
  const tickRoom = Math.max(...xTicks.map(tk => tk.text.length * 6.6 + 14))
  const shownTicks = xTicks.reduce<typeof xTicks>((kept, tk, i) => {
    const last = i === xTicks.length - 1
    while (last && kept.length > 1 && x(tk.at) - x(kept[kept.length - 1].at) < tickRoom) kept.pop()
    return !kept.length || x(tk.at) - x(kept[kept.length - 1].at) >= tickRoom ? [...kept, tk] : kept
  }, [])
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left) / Math.max(1, box.width)) * (n - 1)))))
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setHover(h => Math.max(0, Math.min(n - 1, (h ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))))
    }
  }
  const tipW = 230
  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }}>
      {width > 0 && (
        <Box component="svg" width={width} height={height} role="img" tabIndex={0} aria-label={label} onKeyDown={keys} onBlur={() => setHover(null)}
          sx={{ display: 'block', outline: 'none', touchAction: 'pan-y', '&:focus-visible': { outline: `2px solid ${BA.rose}`, borderRadius: '8px' } }}>
          {ticks.map(v => (
            <g key={v}>
              <line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke={BA.lineSoft} strokeWidth={1} />
              <text x={left - 10} y={y(v) + 4} textAnchor="end" fontSize={11.5} fill={BA.faint}>{axisFormat(v)}</text>
            </g>
          ))}
          {shownTicks.map(tk => (
            <text key={tk.at} x={x(tk.at)} y={height - 8} textAnchor={tk.at === 0 ? 'start' : tk.at === n - 1 ? 'end' : 'middle'} fontSize={11.5}
              fill={hover === tk.at ? BA.ink : BA.faint}>{tk.text}</text>
          ))}
          {guide && (
            <g>
              <line x1={left} x2={left + plotW} y1={y(guide.value)} y2={y(guide.value)} stroke={BA.limewash} strokeWidth={1} />
              {/* Under the line, at the right: where the lines have all risen above it. */}
              <text x={left + plotW} y={y(guide.value) + 15} textAnchor="end" fontSize={11.5} fill={BA.soft}>{guide.text}</text>
            </g>
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} stroke={BA.limewash} strokeWidth={1} />}
          {/* Ours drawn last, on top. */}
          {[...series].reverse().map(s => (
            <g key={s.id}>
              <path d={path(s.values)} fill="none" stroke={PRODUCT_COLOR[s.id]} strokeWidth={s.id === 'business_agent' ? 2.75 : 2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={4.5} fill={PRODUCT_COLOR[s.id]} stroke="#fff" strokeWidth={2} />
              {roomy && (
                <text x={x(s.values.length - 1) + 10} y={y(s.values[s.values.length - 1]) + 4} fontSize={12.5} fontWeight={600} fill={BA.ink}>
                  {format(s.values[s.values.length - 1])}
                </text>
              )}
              {hover !== null && hover < s.values.length && (
                <circle cx={x(hover)} cy={y(s.values[hover])} r={5} fill={PRODUCT_COLOR[s.id]} stroke="#fff" strokeWidth={2} />
              )}
            </g>
          ))}
          <rect x={left} y={top} width={plotW} height={plotH + bottom} fill="transparent"
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
        </Box>
      )}
      {hover !== null && width > 0 && (
        <Box role="status" sx={{ position: 'absolute', top: 0, pointerEvents: 'none', width: tipW, zIndex: 1,
          left: Math.min(Math.max(0, x(hover) + (x(hover) > width / 2 ? -tipW - 12 : 12)), width - tipW),
          bgcolor: '#fff', border: `1px solid ${BA.line}`, borderRadius: '12px', boxShadow: '0 12px 30px -16px rgba(43,37,34,0.4)', p: 1.5 }}>
          <Typography sx={{ fontSize: '0.8rem', color: BA.soft, mb: 0.5 }}>{xLabel(hover)}</Typography>
          {series.map(s => (
            <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={0.9} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PRODUCT_COLOR[s.id], flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.88rem', color: BA.ink }}>{s.name}</Typography>
              </Stack>
              <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: BA.ink }}>{format(s.values[hover] ?? 0)}</Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  )
}

/** The figures behind a chart, folded away under it. */
export function FiguresTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: { head: string; cells: string[] }[] }) {
  return (
    <Box component="details" sx={{ mt: 2, '& summary': { cursor: 'pointer', color: BA.soft, fontSize: '0.9rem', fontWeight: 500, width: 'fit-content' } }}>
      <summary>{t('See the figures')}</summary>
      <Box sx={{ overflowX: 'auto', mt: 1.5 }}>
        <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: 360, width: '100%', fontSize: '0.88rem', '& th, & td': { borderBottom: `1px solid ${BA.lineSoft}`, py: 0.75, px: 1, textAlign: 'right' },
          '& th:first-of-type, & td:first-of-type': { textAlign: 'left' }, '& td': { fontVariantNumeric: 'tabular-nums' }, '& caption': { textAlign: 'left', color: BA.soft, pb: 1 } }}>
          <caption>{caption}</caption>
          <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.head}><th scope="row">{r.head}</th>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
        </Box>
      </Box>
    </Box>
  )
}
