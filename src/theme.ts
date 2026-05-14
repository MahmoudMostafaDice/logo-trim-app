import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7c3aed',
      light: '#8b5cf6',
      dark: '#6d28d9',
    },
    secondary: {
      main: '#0f172a',
      light: '#1e293b',
      dark: '#020617',
    },
    background: {
      default: '#030712',
      paper: '#111827',
    },
    divider: 'rgba(148, 163, 184, 0.16)',
    text: {
      primary: '#f9fafb',
      secondary: '#9ca3af',
    },
    action: {
      hover: 'rgba(139, 92, 246, 0.12)',
      selected: 'rgba(139, 92, 246, 0.24)',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(148, 163, 184, 0.12)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
          backgroundImage: 'none',
          backdropFilter: 'blur(6px)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          paddingInline: 14,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
        },
      },
    },
  },
})
