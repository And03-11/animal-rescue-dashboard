import { alpha, createTheme } from '@mui/material/styles';
import type { PaletteMode, ThemeOptions } from '@mui/material/styles';

export const prefersDarkMode = Boolean(
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-color-scheme: dark)').matches,
);

const fontStack = 'Inter, Manrope, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const brandPalettes = {
  light: {
    primary: '#087A70',
    primaryLight: '#14A395',
    primaryDark: '#075E57',
    secondary: '#B5652A',
    canvas: '#F4F7F6',
    paper: '#FFFFFF',
    raised: '#F8FAF9',
    text: '#17211F',
    muted: '#60706C',
    divider: '#DCE5E2',
  },
  dark: {
    primary: '#4FD1C2',
    primaryLight: '#81E6D9',
    primaryDark: '#2AA89C',
    secondary: '#E6A066',
    canvas: '#0C1211',
    paper: '#131B19',
    raised: '#192321',
    text: '#F3F8F6',
    muted: '#9AAEAA',
    divider: '#293633',
  },
} as const;

const makeTheme = (mode: PaletteMode, primaryOverride?: string) => {
  const colors = brandPalettes[mode];
  const primary = primaryOverride ?? colors.primary;
  const isDark = mode === 'dark';

  const options: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: primary,
        light: primaryOverride ? alpha(primary, 0.78) : colors.primaryLight,
        dark: primaryOverride ? alpha(primary, 0.92) : colors.primaryDark,
        contrastText: isDark ? '#07110F' : '#FFFFFF',
      },
      secondary: { main: colors.secondary },
      background: { default: colors.canvas, paper: colors.paper },
      text: { primary: colors.text, secondary: colors.muted },
      divider: colors.divider,
      success: { main: isDark ? '#5BD19B' : '#18865A' },
      warning: { main: isDark ? '#F2C66D' : '#A96808' },
      error: { main: isDark ? '#FF8585' : '#C84747' },
      info: { main: isDark ? '#72B7EB' : '#2576AD' },
      action: {
        hover: alpha(primary, isDark ? 0.12 : 0.08),
        selected: alpha(primary, isDark ? 0.18 : 0.12),
        focus: alpha(primary, 0.22),
        disabledBackground: alpha(colors.muted, 0.12),
      },
    },
    typography: {
      fontFamily: fontStack,
      h1: { fontSize: '2.25rem', lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.035em' },
      h2: { fontSize: '1.875rem', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.03em' },
      h3: { fontSize: '1.5rem', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.025em' },
      h4: { fontSize: '1.25rem', lineHeight: 1.3, fontWeight: 650, letterSpacing: '-0.015em' },
      h5: { fontSize: '1.125rem', lineHeight: 1.35, fontWeight: 650 },
      h6: { fontSize: '1rem', lineHeight: 1.4, fontWeight: 650 },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      caption: { fontSize: '0.75rem', lineHeight: 1.45 },
      overline: { fontSize: '0.6875rem', lineHeight: 1.5, fontWeight: 700, letterSpacing: '0.1em' },
      button: { fontWeight: 650, letterSpacing: '-0.005em', textTransform: 'none' },
    },
    shape: { borderRadius: 14 },
    shadows: [
      'none',
      `0 1px 2px ${alpha('#000', isDark ? 0.24 : 0.05)}, 0 8px 24px ${alpha('#000', isDark ? 0.16 : 0.04)}`,
      `0 1px 2px ${alpha('#000', isDark ? 0.28 : 0.06)}, 0 12px 32px ${alpha('#000', isDark ? 0.2 : 0.07)}`,
      `0 2px 4px ${alpha('#000', isDark ? 0.3 : 0.07)}, 0 18px 44px ${alpha('#000', isDark ? 0.24 : 0.09)}`,
      ...Array(21).fill(`0 2px 4px ${alpha('#000', 0.08)}, 0 20px 52px ${alpha('#000', isDark ? 0.26 : 0.1)}`),
    ] as ThemeOptions['shadows'],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode },
          body: {
            minWidth: 320,
            backgroundColor: colors.canvas,
            backgroundImage: isDark
              ? `radial-gradient(circle at 15% -10%, ${alpha(primary, 0.08)}, transparent 32rem)`
              : `linear-gradient(180deg, ${colors.raised} 0, ${colors.canvas} 28rem)`,
            backgroundAttachment: 'fixed',
            scrollbarColor: `${alpha(colors.muted, 0.45)} transparent`,
          },
          '*::selection': { backgroundColor: alpha(primary, 0.22) },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: true },
        styleOverrides: { root: { '&.Mui-focusVisible': { outline: `3px solid ${alpha(primary, 0.28)}`, outlineOffset: 2 } } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 40, borderRadius: 12, paddingInline: 18, transition: 'background-color 180ms ease, border-color 180ms ease, transform 180ms ease' },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none', transform: 'translateY(-1px)' } },
          outlined: { borderColor: colors.divider, '&:hover': { borderColor: alpha(primary, 0.55), backgroundColor: alpha(primary, 0.05) } },
          text: { '&:hover': { backgroundColor: alpha(primary, 0.07) } },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 12, transition: 'background-color 180ms ease, color 180ms ease' } },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', border: `1px solid ${colors.divider}` },
          rounded: { borderRadius: 18 },
          elevation0: { boxShadow: 'none' },
          elevation1: { boxShadow: isDark ? '0 1px 0 rgba(255,255,255,0.025) inset' : '0 1px 2px rgba(15,35,30,0.025)' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 18, border: `1px solid ${colors.divider}`, boxShadow: 'none', backgroundImage: `linear-gradient(180deg, ${alpha(colors.raised, 0.72)}, ${colors.paper} 36%)` },
        },
      },
      MuiCardContent: { styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 } } } },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none', boxShadow: 'none' } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none', backgroundColor: colors.paper } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 22, boxShadow: `0 24px 72px ${alpha('#000', isDark ? 0.42 : 0.18)}` } } },
      MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 8px', fontWeight: 700 } } },
      MuiDialogContent: { styleOverrides: { root: { padding: '16px 24px 24px' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { minHeight: 44, borderRadius: 12, backgroundColor: alpha(colors.raised, 0.7), '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.divider }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(colors.muted, 0.65) }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5, borderColor: primary, boxShadow: `0 0 0 3px ${alpha(primary, 0.14)}` } },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: '14px 20px', borderBottom: `1px solid ${colors.divider}` },
          head: { backgroundColor: colors.raised, color: colors.muted, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.055em', textTransform: 'uppercase' },
        },
      },
      MuiTableRow: { styleOverrides: { root: { '&:last-child td': { borderBottom: 0 }, '&:hover': { backgroundColor: alpha(primary, 0.035) } } } },
      MuiChip: { styleOverrides: { root: { height: 28, borderRadius: 9, fontWeight: 600 }, outlined: { borderColor: colors.divider } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 14, border: '1px solid currentColor', alignItems: 'center' }, standardSuccess: { backgroundColor: alpha(isDark ? '#5BD19B' : '#18865A', 0.1) }, standardError: { backgroundColor: alpha(isDark ? '#FF8585' : '#C84747', 0.1) } } },
      MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, padding: '7px 10px', fontSize: '0.75rem' } } },
      MuiSkeleton: { defaultProps: { animation: 'wave' }, styleOverrides: { root: { borderRadius: 8 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 44 }, indicator: { height: 3, borderRadius: 3 } } },
      MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 600 } } },
    },
  };

  return createTheme(options);
};

export const lightTheme = makeTheme('light');
export const darkTheme = makeTheme('dark');

// Kept for stored user preferences; both retain the same neutral product system.
export const limeTheme = makeTheme('light', '#4F772D');
export const violetTheme = makeTheme('dark', '#A78BFA');
