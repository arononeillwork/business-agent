import { createTheme } from '@mui/material/styles'
import { businessConfig } from '../shared/business.config'

export const theme = createTheme({
  palette: {
    primary: { main: businessConfig.brand.primary },
    secondary: { main: businessConfig.brand.secondary },
    background: { default: businessConfig.brand.background, paper: '#ffffff' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
  },
})
