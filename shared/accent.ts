// A business's own main colour (Brand → its primary colour, or the one chosen in the set-up guide) as
// the app's accent, in place of the rose pink every business had. The shades the app needs are worked
// out from it: a deep step readable as text (4.5:1 on the page), soft washes for panels, and the text
// colour that reads on it. Dark mode lifts a colour that would sink into the dark background.
type RGB = [number, number, number]

const INK: RGB = [0x2b, 0x25, 0x22]
const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]
const LIGHT_BG: RGB = [0xf8, 0xf4, 0xef]
const DARK_BG: RGB = [0x11, 0x0e, 0x15]
const DARK_SURFACE: RGB = [0x1a, 0x16, 0x20]

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)
const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB
const hex = (c: RGB) => `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
/** a, moved t of the way towards b. */
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB
const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const luminance = (c: RGB) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])
/** WCAG contrast ratio of two colours (1 to 21). */
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Moves c towards `to` in small steps until it reads on `on` (or as far as it goes). */
function untilReadable(c: RGB, to: RGB, on: RGB, ratio: number): RGB {
  for (let t = 0; t <= 1; t += 0.04) {
    const step = mix(c, to, t)
    if (contrast(hex(step), hex(on)) >= ratio) return step
  }
  return to
}

export interface Accent {
  rose: string; roseHover: string; roseDeep: string; roseSoft: string; roseWash: string
  chart: string; chartHover: string; glow: string
  /** Text on the accent colour itself (buttons): the app's ink or white, whichever reads better. */
  onRose: string
}

/** The accent's shades for light or dark mode, from the business's main colour. */
export function accentFor(main: string, mode: 'light' | 'dark'): Accent {
  const base = rgb(main)
  const on = (c: RGB) => (contrast(hex(c), hex(INK)) >= contrast(hex(c), '#FFFFFF') ? hex(INK) : '#FFFFFF')
  const glow = (c: RGB, a: number) => `rgba(${c.map(Math.round).join(',')},${a})`
  if (mode === 'light') {
    return {
      rose: hex(base), roseHover: hex(mix(base, BLACK, 0.08)),
      roseDeep: hex(untilReadable(base, INK, LIGHT_BG, 4.5)),
      roseSoft: hex(mix(base, WHITE, 0.88)), roseWash: hex(mix(base, WHITE, 0.92)),
      chart: hex(base), chartHover: hex(mix(base, BLACK, 0.12)), glow: glow(base, 0.16), onRose: on(base),
    }
  }
  // Dark mode: a colour too dark to see on the plum-black background is lifted first.
  const lit = untilReadable(base, WHITE, DARK_BG, 3)
  return {
    rose: hex(lit), roseHover: hex(mix(lit, WHITE, 0.15)),
    roseDeep: hex(untilReadable(lit, WHITE, DARK_SURFACE, 4.5)),
    roseSoft: hex(mix(lit, DARK_SURFACE, 0.82)), roseWash: hex(mix(lit, DARK_BG, 0.85)),
    chart: hex(lit), chartHover: hex(mix(lit, WHITE, 0.15)), glow: glow(lit, 0.14), onRose: on(lit),
  }
}

/** The business's main colour from its Brand page: the primary one, else the first. Null: none set. */
export function mainColour(colours: { hex: string; role?: string }[] | null | undefined): string | null {
  const c = colours?.find(x => x.role === 'primary' && isHex(x.hex)) ?? colours?.find(x => isHex(x.hex))
  return c ? c.hex.toUpperCase() : null
}

/** "r g b" for MUI's *Channel variables. */
export const channels = (h: string) => rgb(h).join(' ')
