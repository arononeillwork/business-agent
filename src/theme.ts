import { alpha, createTheme } from '@mui/material/styles'

// Design tokens: espresso ink, matcha accent, warm-neutral surfaces.
export const tokens = {
  ink: '#1c1410',
  inkSoft: '#5f5650',
  inkFaint: '#8d847d',
  espresso: '#3b2a21',
  matcha: '#4f7d4a',
  matchaSoft: '#e9f1e6',
  bg: '#f5f3f0',
  surface: '#ffffff',
  surfaceAlt: '#faf8f6',
  line: '#e8e3dd',
  lineStrong: '#d9d2ca',
  danger: '#c0392b',
  warning: '#b7791f',
  info: '#2f6f9f',
}

const font = '"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export const theme = createTheme({
  palette: {
    primary: { main: tokens.espresso, contrastText: '#fff' },
    secondary: { main: tokens.matcha, contrastText: '#fff' },
    success: { main: tokens.matcha },
    error: { main: tokens.danger },
    warning: { main: tokens.warning },
    info: { main: tokens.info },
    text: { primary: tokens.ink, secondary: tokens.inkSoft, disabled: tokens.inkFaint },
    background: { default: tokens.bg, paper: tokens.surface },
    divider: tokens.line,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: font,
    fontSize: 14.5,
    h4: { fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1.9rem', lineHeight: 1.2 },
    h5: { fontWeight: 800, letterSpacing: '-0.015em', fontSize: '1.55rem', lineHeight: 1.25 },
    h6: { fontWeight: 700, letterSpacing: '-0.01em', fontSize: '1.08rem', lineHeight: 1.35 },
    subtitle1: { fontWeight: 700 },
    subtitle2: { fontWeight: 700, fontSize: '0.9rem' },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    overline: { fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.7rem', lineHeight: 1.6 },
    caption: { lineHeight: 1.45 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.bg, WebkitFontSmoothing: 'antialiased', fontFeatureSettings: '"tnum" 0' },
        '::selection': { background: alpha(tokens.matcha, 0.25) },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 16 },
        sizeLarge: { paddingBlock: 12, fontSize: '1rem', borderRadius: 12 },
        outlined: { borderColor: tokens.lineStrong, color: tokens.ink, background: tokens.surface,
          '&:hover': { borderColor: tokens.inkFaint, background: tokens.surfaceAlt } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${tokens.line}`, borderRadius: 16, backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(28,20,16,0.04)' },
      },
    },
    MuiCardContent: { styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10, background: tokens.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.lineStrong } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 700, fontSize: '0.75rem' },
        sizeSmall: { height: 22 },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, alignItems: 'center' },
      },
      variants: [
        { props: { variant: 'standard', severity: 'info' }, style: { background: '#eef4f9', color: '#1f4d70' } },
        { props: { variant: 'standard', severity: 'warning' }, style: { background: '#fbf3e6', color: '#7a4f10' } },
        { props: { variant: 'standard', severity: 'success' }, style: { background: tokens.matchaSoft, color: '#2f5a2b' } },
        { props: { variant: 'standard', severity: 'error' }, style: { background: '#fbecea', color: '#8a241a' } },
      ],
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: tokens.line, paddingBlock: 12 },
        head: { fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: tokens.inkFaint, background: tokens.surfaceAlt },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20, border: `1px solid ${tokens.line}` } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 800, fontSize: '1.2rem', paddingTop: 22 } } },
    MuiTooltip: { styleOverrides: { tooltip: { background: tokens.ink, fontSize: '0.78rem', borderRadius: 8, padding: '8px 10px' } } },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 10,
          '&.Mui-selected': { background: tokens.matchaSoft, color: '#2f5a2b',
            '& .MuiListItemIcon-root': { color: tokens.matcha } },
          '&.Mui-selected:hover': { background: '#dfeada' } },
      },
    },
    MuiBottomNavigation: { styleOverrides: { root: { height: 64, borderTop: `1px solid ${tokens.line}` } } },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { color: tokens.inkFaint, '&.Mui-selected': { color: tokens.espresso } },
        label: { fontWeight: 700, fontSize: '0.7rem', '&.Mui-selected': { fontSize: '0.7rem' } } },
    },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 12 } } },
  },
})
