import CssBaseline from '@mui/material/CssBaseline'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import { ThemeProvider } from '@mui/material/styles'
import type { ReactNode } from 'react'

import { appTheme } from '../theme'

type Props = {
  children: ReactNode
}

export default function LayoutDefault({ children }: Props) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
          background: '#030712',
          '@keyframes drift': {
            '0%': { transform: 'translate3d(0, 0, 0) scale(1)' },
            '50%': { transform: 'translate3d(20px, -30px, 0) scale(1.08)' },
            '100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          },
          '@keyframes pulseGlow': {
            '0%': { opacity: 0.35 },
            '50%': { opacity: 0.6 },
            '100%': { opacity: 0.35 },
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: -120,
            background:
              'radial-gradient(700px 360px at 12% 12%, rgba(124,58,237,0.34), transparent), radial-gradient(680px 340px at 88% 8%, rgba(37,99,235,0.3), transparent), radial-gradient(460px 260px at 50% 92%, rgba(14,165,233,0.2), transparent)',
            filter: 'blur(10px)',
            animation: 'pulseGlow 12s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '8%',
            left: '6%',
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'rgba(139, 92, 246, 0.2)',
            filter: 'blur(26px)',
            animation: 'drift 16s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            right: '10%',
            bottom: '8%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.2)',
            filter: 'blur(30px)',
            animation: 'drift 18s ease-in-out infinite reverse',
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 1500,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 5 },
            py: { xs: 2.5, md: 4 },
          }}
        >
          {children}
        </Box>
      </Container>
    </ThemeProvider>
  )
}
