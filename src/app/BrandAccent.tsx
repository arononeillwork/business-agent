// The business's own main colour (Brand page, or the set-up guide) as the app's accent: buttons, links,
// the selected menu item, charts and the wash at the top of each page, in light and dark mode. Without
// one, the app keeps The Business Agent's rose. Applied as CSS variables, so nothing else re-renders.
import { useEffect } from 'react'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { accentFor, channels, mainColour, type Accent } from '../../shared/accent'

const STYLE_ID = 'eb-brand-accent'

const vars = (a: Accent) => ({
  '--eb-rose': a.rose, '--eb-rose-hover': a.roseHover, '--eb-rose-deep': a.roseDeep, '--eb-rose-soft': a.roseSoft,
  '--eb-rose-wash': a.roseWash, '--eb-chart': a.chart, '--eb-chart-hover': a.chartHover, '--eb-glow': a.glow,
  '--eb-on-rose': a.onRose,
  // MUI's own colour variables (buttons, switches, progress bars, focus rings).
  '--mui-palette-primary-main': a.rose, '--mui-palette-primary-mainChannel': channels(a.rose),
  '--mui-palette-primary-dark': a.roseDeep, '--mui-palette-primary-darkChannel': channels(a.roseDeep),
  '--mui-palette-primary-light': a.roseSoft, '--mui-palette-primary-lightChannel': channels(a.roseSoft),
  '--mui-palette-primary-contrastText': a.onRose, '--mui-palette-primary-contrastTextChannel': channels(a.onRose),
})

const block = (selector: string, v: Record<string, string>) =>
  `${selector}{${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';')}}`

// The wash at the top of each page, unless the person chose their own background tint (Appearance).
const backdrop = (a: Accent, mode: 'light' | 'dark') => ({
  '--eb-backdrop': mode === 'light'
    ? `radial-gradient(1000px 440px at 80% -160px, ${a.glow.replace(/[\d.]+\)$/, '0.22)')}, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 360px)`
    : `radial-gradient(900px 460px at 78% -140px, ${a.glow.replace(/[\d.]+\)$/, '0.20)')}, transparent 70%)`,
})

/** The CSS that puts a main colour in place of the rose, or '' for none. Selectors are doubled so they win over MUI's and the theme's own, wherever those land in the page. */
export function accentCss(main: string | null): string {
  if (!main) return ''
  const light = accentFor(main, 'light'), dark = accentFor(main, 'dark')
  return block(':root:root', vars(light))
    + block('[data-eb-theme="dark"][data-eb-theme="dark"]', vars(dark))
    + block(':root:root:not([data-eb-bg="tint"])', backdrop(light, 'light'))
    + block('[data-eb-theme="dark"][data-eb-theme="dark"]:not([data-eb-bg="tint"])', backdrop(dark, 'dark'))
}

/** Keeps the page's accent in step with the signed-in business's main colour. */
export function BrandAccentSync() {
  const { api, me } = useApp()
  // Someone in no business yet (business_id null) has no brand to take a colour from.
  const inBusiness = !!me && me.business_id !== null && me.active && me.role !== 'kiosk'
  const brand = useAsync('brand', () => (inBusiness ? api.brand() : Promise.resolve(null)), [inBusiness])
  const css = accentCss(inBusiness ? mainColour(brand.data?.colours) : null)
  useEffect(() => {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!css) { el?.remove(); return }
    if (!el) {
      el = Object.assign(document.createElement('style'), { id: STYLE_ID })
      // Last in the head, after MUI's own variables, so these win.
      document.head.appendChild(el)
    }
    if (el.textContent !== css) el.textContent = css
  }, [css])
  return null
}
