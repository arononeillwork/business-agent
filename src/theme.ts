import { alpha, createTheme } from '@mui/material/styles'

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

// Neutrals and tints derived from the brand colours (tints of the five, plus a warm ink for text).
export const tokens = {
  ink: '#2B2522',            // body text: warm near-black, biased toward Limewash
  inkSoft: '#6B645E',
  inkFaint: '#9A948D',
  bg: brand.cream,
  surface: brand.white,
  surfaceAlt: '#F8F4F1',     // warm off-white for quiet panels
  sidebar: '#EFECE8',        // Limewash at ~30%
  line: '#EFE9E4',           // hairlines: warm, barely there
  lineStrong: '#DDD5CE',     // input borders
  rose: brand.rosePink,
  roseHover: '#F28893',
  roseDeep: brand.roseDeep,
  roseSoft: '#FDEEEF',       // Rose Pink at ~15%
  roseWash: brand.roseWash,
  ube: brand.ubeLilac,
  ubeSoft: '#EFE9F7',
  ubeDeep: '#5B4A86',
  matcha: brand.matcha,
  matchaSoft: '#E8EEE2',
  matchaDeep: '#4A6536',
  // Semantic states (kept inside the palette's family).
  danger: '#B3404F',
  dangerSoft: '#F9DDE0',
  warning: '#9A6A12',
  warningSoft: '#FFF1EA',
  info: '#5B4A86',
  // Kept for existing callers.
  espresso: '#2B2522',
}

export const fonts = {
  display: '"Poppins", "Montserrat", system-ui, sans-serif',
  text: '"Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif',
}

const display = { fontFamily: fonts.display, fontWeight: 600, letterSpacing: '-0.02em' }

export const theme = createTheme({
  palette: {
    primary: { main: tokens.rose, dark: tokens.roseDeep, light: tokens.roseSoft, contrastText: tokens.ink },
    secondary: { main: tokens.matcha, contrastText: '#fff' },
    success: { main: tokens.matcha, contrastText: '#fff' },
    error: { main: tokens.danger },
    warning: { main: tokens.warning },
    info: { main: tokens.info },
    text: { primary: tokens.ink, secondary: tokens.inkSoft, disabled: tokens.inkFaint },
    background: { default: tokens.bg, paper: tokens.surface },
    divider: tokens.line,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: fonts.text,
    fontSize: 15,
    h1: display, h2: display, h3: display,
    h4: { ...display, fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.12, letterSpacing: '-0.035em' },
    h5: { ...display, fontSize: '1.5rem', lineHeight: 1.25 },
    h6: { ...display, fontWeight: 500, fontSize: '1.1rem', lineHeight: 1.35, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, fontSize: '0.9rem' },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    overline: { fontFamily: fonts.text, fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.69rem', lineHeight: 1.6 },
    caption: { fontSize: '0.8rem', lineHeight: 1.45 },
    button: { fontFamily: fonts.text, textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.bg, WebkitFontSmoothing: 'antialiased',
          // A soft wash of the brand pink at the top of every page instead of flat beige.
          backgroundImage: 'radial-gradient(1200px 420px at 70% -120px, rgba(247,155,164,0.16), transparent 70%)', backgroundRepeat: 'no-repeat' },
        '::selection': { background: alpha(tokens.rose, 0.35) },
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
          style: { backgroundColor: tokens.rose, color: tokens.ink, '&:hover': { backgroundColor: tokens.roseHover } } },
      ],
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${tokens.line}`, borderRadius: 20, backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(120,72,60,0.04), 0 12px 32px -18px rgba(120,72,60,0.18)' },
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
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: tokens.roseDeep, '& + .MuiSwitch-track': { backgroundColor: tokens.rose, opacity: 1 } } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600, fontSize: '0.75rem' }, sizeSmall: { height: 22 } } },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 14, alignItems: 'center' } },
      variants: [
        { props: { variant: 'standard', severity: 'info' }, style: { background: '#F4F0FB', color: tokens.ubeDeep, border: '1px solid #E4DBF3' } },
        { props: { variant: 'standard', severity: 'warning' }, style: { background: '#FFF1EA', color: '#8A4336', border: '1px solid #FBDCCF' } },
        { props: { variant: 'standard', severity: 'success' }, style: { background: '#EEF4E8', color: tokens.matchaDeep, border: '1px solid #DCE8D1' } },
        { props: { variant: 'standard', severity: 'error' }, style: { background: tokens.dangerSoft, color: '#8E2B3A' } },
        { props: { variant: 'filled', severity: 'success' }, style: { background: tokens.ink, color: '#fff' } },
        { props: { variant: 'filled', severity: 'info' }, style: { background: tokens.ink, color: '#fff' } },
      ],
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: tokens.line, paddingBlock: 12 },
        head: { fontSize: '0.69rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: tokens.inkSoft, background: tokens.surfaceAlt },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24, border: `1px solid ${tokens.line}` } } },
    MuiDialogTitle: { styleOverrides: { root: { ...display, fontSize: '1.25rem', paddingTop: 24 } } },
    MuiTooltip: { styleOverrides: { tooltip: { background: tokens.ink, fontSize: '0.8rem', borderRadius: 10, padding: '8px 10px' } } },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 12,
          '&:hover': { background: alpha(tokens.rose, 0.12) },
          '&.Mui-selected': { background: tokens.surface, color: tokens.ink, boxShadow: `inset 3px 0 0 ${tokens.rose}, 0 1px 2px rgba(43,37,34,0.06)`,
            '& .MuiListItemIcon-root': { color: tokens.roseDeep } },
          '&.Mui-selected:hover': { background: tokens.surface } },
      },
    },
    MuiBottomNavigation: { styleOverrides: { root: { height: 66, borderTop: `1px solid ${tokens.line}`, background: tokens.surface } } },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { color: tokens.inkFaint, '&.Mui-selected': { color: tokens.roseDeep } },
        label: { fontWeight: 600, fontSize: '0.7rem', '&.Mui-selected': { fontSize: '0.7rem' } } },
    },
    MuiLink: { styleOverrides: { root: { color: tokens.roseDeep } } },
  },
})
