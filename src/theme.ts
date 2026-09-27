import { createTheme } from '@mui/material/styles'

// Easy Beans brand (Brand guidelines, Edition 01, April 2026, p.13–14).
// Five colours: Rose Pink leads, Grey Limewash holds everything together, Rose Wash, Ube Lilac and
// Matcha Green come in one at a time. Cream and white are the bases. Poppins for display,
// Figtree for text.
export const brand = {
  rosePink: '#F79BA4',     // primary: headlines accents, buttons, the logo circle
  roseDeep: '#A85A68',     // the deep step of Rose Pink, for pink text on light grounds
  limewash: '#C6C2BB',     // secondary: surfaces and panels, used generously
  roseWash: '#F3DED3',     // soft panels, quiet backgrounds behind copy
  ubeLilac: '#B7A3D8',     // ube drinks, seasonal moments
  matcha: '#6B8E4E',       // wellbeing, sourcing, "all good" cues
  cream: '#FBF8F4',        // preferred base
  white: '#FFFFFF',
}

/**
 * Every colour the app uses, in light and dark. Components use `tokens.x`, which is a CSS
 * variable, so the person's theme choice (My account → Appearance) switches the whole app at once.
 * The *Fg / *Bg pairs are for tags and notices (good, warning, problem, neutral, info).
 */
const light = {
  ink: '#2B2522', inkSoft: '#5F5852', inkFaint: '#8E877F',
  bg: brand.cream, surface: brand.white, surfaceAlt: '#F8F4F1', line: '#EFE9E4', lineStrong: '#DDD5CE',
  rose: brand.rosePink, roseHover: '#F28893', roseDeep: brand.roseDeep, roseSoft: '#FDEEEF', roseWash: '#FFF1EA',
  ube: brand.ubeLilac, ubeSoft: '#F4F0FB', ubeDeep: '#5B4A86',
  matcha: brand.matcha, matchaSoft: '#EEF4E8', matchaDeep: '#4A6536',
  danger: '#B3404F', dangerSoft: '#F9DDE0', warning: '#9A6A12', info: '#5B4A86',
  goodFg: '#4A6536', goodBg: '#EEF4E8', warnFg: '#8A4336', warnBg: '#FFF1EA',
  badFg: '#8E2B3A', badBg: '#F9DDE0', neutralFg: '#5F5852', neutralBg: '#F2EDE9', infoFg: '#5B4A86', infoBg: '#F4F0FB',
  today: '#FEF6F6', hover: '#FAF4F1', glow: 'rgba(247,155,164,0.16)', shadow: 'rgba(120,72,60,0.18)',
  // The sidebar: white and calm in light mode, deep plum in dark mode.
  navBg: '#FFFFFF', navText: '#4E4742', navFaint: '#9A928B', navHover: '#F8F1EE', navBright: '#2B2522', navPanel: '#F8F4F1', navLine: '#EFE9E4',
  // Card finish: flat in light mode; a faint sheen and top edge in dark mode so panels read as layers.
  sheen: 'none', edge: 'transparent',
  // The page backdrop behind everything (soft brand washes).
  backdrop: `radial-gradient(1200px 420px at 70% -120px, rgba(247,155,164,0.16), transparent 70%)`,
}
type Palette = typeof light
// Dark: deep plum-black rather than flat brown-black, with the brand pink and ube lilac glowing
// through, layered surfaces and soft light edges, so it feels like a lit café at night.
const dark: Palette = {
  ink: '#F6F1F4', inkSoft: '#CBC1CA', inkFaint: '#978C99',
  bg: '#110E15', surface: '#1A1620', surfaceAlt: '#221D29', line: '#2E2836', lineStrong: '#433B4E',
  rose: brand.rosePink, roseHover: '#FAB0B7', roseDeep: '#F7A9B1', roseSoft: '#33212C', roseWash: '#2E2129',
  ube: brand.ubeLilac, ubeSoft: '#282238', ubeDeep: '#D2C4F0',
  matcha: '#95BA78', matchaSoft: '#1F2A1E', matchaDeep: '#B9D6A1',
  danger: '#F38E9A', dangerSoft: '#3A1D26', warning: '#EDC27A', info: '#D2C4F0',
  goodFg: '#B9D6A1', goodBg: '#1F2A1E', warnFg: '#F5C2AE', warnBg: '#33231F',
  badFg: '#F7A7B1', badBg: '#3A1D26', neutralFg: '#CBC1CA', neutralBg: '#26212D', infoFg: '#D2C4F0', infoBg: '#282238',
  today: '#2A1B25', hover: '#241F2B', glow: 'rgba(247,155,164,0.14)', shadow: 'rgba(0,0,0,0.65)',
  navBg: '#15111A', navText: 'rgba(246,241,244,0.74)', navFaint: 'rgba(246,241,244,0.40)', navHover: 'rgba(246,241,244,0.06)',
  navBright: '#FFFFFF', navPanel: 'rgba(246,241,244,0.05)', navLine: 'rgba(246,241,244,0.07)',
  sheen: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 42%)', edge: 'rgba(255,255,255,0.06)',
  backdrop: [
    'radial-gradient(900px 460px at 78% -140px, rgba(247,155,164,0.20), transparent 70%)',
    'radial-gradient(700px 420px at 8% -80px, rgba(183,163,216,0.14), transparent 70%)',
  ].join(', '),
}
// High contrast: darker secondary text and firmer lines (applied on top of light or dark).
const contrastLight: Partial<Palette> = { inkSoft: '#3F3935', inkFaint: '#5F5852', line: '#CFC6BE', lineStrong: '#8E877F' }
const contrastDark: Partial<Palette> = { inkSoft: '#EAE2E9', inkFaint: '#CBC1CA', line: '#5A5064', lineStrong: '#978C99' }

const cssVar = (k: string) => `--eb-${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`
const varsOf = (p: Partial<Palette>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [cssVar(k), v]))

export const tokens = Object.fromEntries(Object.keys(light).map(k => [k, `var(${cssVar(k)})`])) as Record<keyof Palette, string> & { espresso: string }
tokens.espresso = '#2B2522' // dark hero panels stay espresso in both themes

export const fonts = {
  display: '"Poppins", "Montserrat", system-ui, sans-serif',
  text: 'var(--eb-font-text, "Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif)',
}

const display = { fontFamily: fonts.display, fontWeight: 500, letterSpacing: '-0.015em' }

const scheme = (p: Palette) => ({
  palette: {
    primary: { main: brand.rosePink, dark: brand.roseDeep, light: '#FDEEEF', contrastText: '#2B2522' },
    secondary: { main: brand.matcha, contrastText: '#fff' },
    success: { main: p.matcha, contrastText: '#fff' },
    error: { main: p.danger },
    warning: { main: p.warning },
    info: { main: p.info },
    text: { primary: p.ink, secondary: p.inkSoft, disabled: p.inkFaint },
    background: { default: p.bg, paper: p.surface },
    divider: p.line,
  },
})

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: '[data-eb-theme="%s"]' },
  colorSchemes: { light: scheme(light), dark: scheme(dark) },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: fonts.text,
    fontSize: 15,
    fontWeightBold: 600,
    h1: display, h2: display, h3: display,
    h4: { ...display, fontSize: '2.1rem', lineHeight: 1.15, letterSpacing: '-0.025em' },
    h5: { ...display, fontSize: '1.45rem', lineHeight: 1.25 },
    h6: { fontFamily: fonts.text, fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.35, letterSpacing: 0 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500, fontSize: '0.9rem' },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    overline: { fontFamily: fonts.text, fontWeight: 600, letterSpacing: '0.1em', fontSize: '0.69rem', lineHeight: 1.6 },
    caption: { fontSize: '0.8rem', lineHeight: 1.45 },
    button: { fontFamily: fonts.text, textTransform: 'none', fontWeight: 500, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { ...varsOf(light) },
        '[data-eb-theme="dark"]': { ...varsOf(dark), colorScheme: 'dark' },
        '[data-eb-contrast="high"]': varsOf(contrastLight),
        '[data-eb-theme="dark"][data-eb-contrast="high"]': varsOf(contrastDark),
        '[data-eb-font="readable"]': { '--eb-font-text': '"Atkinson Hyperlegible", "Figtree", Arial, sans-serif' },
        '[data-eb-motion="reduce"] *, [data-eb-motion="reduce"] *::before, [data-eb-motion="reduce"] *::after':
          { animationDuration: '0.001ms !important', transitionDuration: '0.001ms !important', scrollBehavior: 'auto !important' },
        '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animationDuration: '0.001ms !important', transitionDuration: '0.001ms !important' } },
        body: { backgroundColor: tokens.bg, WebkitFontSmoothing: 'antialiased',
          // A soft wash of the brand pink at the top of every page instead of flat beige.
          backgroundImage: tokens.backdrop, backgroundRepeat: 'no-repeat' },
        '::selection': { background: 'rgba(247,155,164,0.35)' },
        ':focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 2 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999, paddingInline: 18, minHeight: 38 },
        sizeLarge: { minHeight: 48, fontSize: '1rem', paddingInline: 24 },
        sizeSmall: { minHeight: 32, paddingInline: 14 },
        outlined: { borderColor: tokens.lineStrong, color: tokens.ink, background: tokens.surface,
          '&:hover': { borderColor: tokens.roseDeep, background: tokens.roseSoft } },
        text: { color: tokens.roseDeep },
      },
      variants: [
        { props: { variant: 'contained', color: 'primary' },
          style: { backgroundColor: brand.rosePink, color: '#2B2522', fontWeight: 600, '&:hover': { backgroundColor: '#F28893' } } },
      ],
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${tokens.line}`, borderRadius: 20, backgroundImage: tokens.sheen, backgroundColor: tokens.surface,
          boxShadow: `inset 0 1px 0 ${tokens.edge}, 0 1px 2px rgba(120,72,60,0.04), 0 12px 32px -18px ${tokens.shadow}` },
      },
    },
    MuiCardContent: { styleOverrides: { root: { padding: 22, '&:last-child': { paddingBottom: 22 } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 12, background: tokens.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.lineStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.inkFaint },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.roseDeep } },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { '&.Mui-focused': { color: tokens.roseDeep } } } },
    MuiCheckbox: { styleOverrides: { root: { '&.Mui-checked': { color: tokens.roseDeep } } } },
    MuiRadio: { styleOverrides: { root: { '&.Mui-checked': { color: tokens.roseDeep } } } },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: tokens.roseDeep, '& + .MuiSwitch-track': { backgroundColor: brand.rosePink, opacity: 1 } } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 500, fontSize: '0.78rem' }, sizeSmall: { height: 22 } } },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 14, alignItems: 'center' } },
      variants: [
        { props: { variant: 'standard', severity: 'info' }, style: { background: tokens.infoBg, color: tokens.infoFg, border: `1px solid ${tokens.line}` } },
        { props: { variant: 'standard', severity: 'warning' }, style: { background: tokens.warnBg, color: tokens.warnFg, border: `1px solid ${tokens.line}` } },
        { props: { variant: 'standard', severity: 'success' }, style: { background: tokens.goodBg, color: tokens.goodFg, border: `1px solid ${tokens.line}` } },
        { props: { variant: 'standard', severity: 'error' }, style: { background: tokens.badBg, color: tokens.badFg } },
        { props: { variant: 'filled', severity: 'success' }, style: { background: '#2B2522', color: '#fff' } },
        { props: { variant: 'filled', severity: 'info' }, style: { background: '#2B2522', color: '#fff' } },
      ],
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: tokens.line, paddingBlock: 12 },
        head: { fontSize: '0.69rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: tokens.inkSoft, background: tokens.surfaceAlt },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24, border: `1px solid ${tokens.line}`, backgroundColor: tokens.surface,
      backgroundImage: tokens.sheen, boxShadow: `inset 0 1px 0 ${tokens.edge}, 0 24px 64px -24px ${tokens.shadow}` } } },
    MuiDialogTitle: { styleOverrides: { root: { ...display, fontSize: '1.25rem', paddingTop: 24 } } },
    MuiTooltip: { styleOverrides: { tooltip: { background: '#2B2522', fontSize: '0.8rem', borderRadius: 10, padding: '8px 10px' } } },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 12,
          '&:hover': { background: tokens.hover },
          '&.Mui-selected': { background: tokens.roseSoft, color: tokens.ink, '& .MuiListItemIcon-root': { color: tokens.roseDeep } },
          '&.Mui-selected:hover': { background: tokens.roseSoft } },
      },
    },
    MuiBottomNavigation: { styleOverrides: { root: { height: 66, borderTop: `1px solid ${tokens.line}`, background: tokens.surface } } },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { color: tokens.inkFaint, '&.Mui-selected': { color: tokens.roseDeep } },
        label: { fontWeight: 500, fontSize: '0.7rem', '&.Mui-selected': { fontSize: '0.7rem' } } },
    },
    MuiLink: { styleOverrides: { root: { color: tokens.roseDeep } } },
    MuiMenu: { styleOverrides: { paper: { backgroundColor: tokens.surface } } },
    MuiPopover: { styleOverrides: { paper: { backgroundColor: tokens.surface } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: tokens.surface } } },
  },
})
