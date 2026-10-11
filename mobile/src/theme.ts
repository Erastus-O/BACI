import { Platform, TextStyle, ViewStyle } from 'react-native';

// BACI design system: dark navy glass.
// Screens sit on a deep navy gradient (assets/backdrop.jpg, see Backdrop in components/ui.tsx).
// Content lives on frosted, translucent glass; the main action is a white pill; blue is the accent.
// Change the look here, not in screens.

export const colors = {
  // ----- Ground -----
  /** Fallback behind the gradient backdrop. */
  ground: '#05060F',

  // ----- Glass -----
  /** Frosted glass card fill. */
  surface: 'rgba(255,255,255,0.07)',
  /** Raised glass: pressed states, segmented "on", secondary buttons. */
  surfaceRaised: 'rgba(255,255,255,0.12)',
  /** Opaque sheet for dialogs and bars over moving content. */
  sheet: '#12162E',
  /** Translucent navy for the tab bar and chat composer. */
  bar: 'rgba(8,10,26,0.78)',
  /** The light edge that makes glass read as glass. */
  glassEdge: 'rgba(255,255,255,0.12)',

  // ----- Text -----
  ink: '#FFFFFF',
  inkSoft: 'rgba(255,255,255,0.82)',
  muted: 'rgba(226,232,255,0.62)',

  // ----- Actions -----
  /** Main call to action: a white pill with dark text. */
  cta: '#FFFFFF',
  ctaPressed: 'rgba(255,255,255,0.82)',
  onCta: '#090B18',
  /** Accent blue: links, progress, checkboxes, toggles, the user's chat bubbles. */
  primary: '#4F86FF',
  primaryPressed: '#3B70E6',
  primaryTint: 'rgba(79,134,255,0.18)',

  // ----- Lines and controls -----
  ringOuter: 'rgba(255,255,255,0.18)',
  ringInner: 'rgba(255,255,255,0.28)',
  border: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(255,255,255,0.08)',
  control: 'rgba(255,255,255,0.18)',
  chipLine: 'rgba(255,255,255,0.22)',
  toggleOff: 'rgba(255,255,255,0.22)',
  stepIdle: 'rgba(255,255,255,0.16)',
  track: 'rgba(255,255,255,0.10)',
  disabled: 'rgba(255,255,255,0.14)',

  // ----- Status (tinted glass backgrounds, light text) -----
  successBg: 'rgba(64,214,138,0.15)',
  successFg: '#63E3A0',
  warnBg: 'rgba(255,186,82,0.15)',
  warnFg: '#FFC46B',
  warnInk: '#FFE1B3',
  dangerBg: 'rgba(255,99,88,0.16)',
  dangerFg: '#FF6B5F',
  dangerInk: '#FFCAC4',
  infoBg: 'rgba(79,134,255,0.17)',
  infoFg: '#93B6FF',
  infoInk: '#D6E3FF',
  accent: '#FFB38A',
};

const blur = (px: number): ViewStyle =>
  Platform.OS === 'web' ? ({ backdropFilter: `blur(${px}px) saturate(150%)`, WebkitBackdropFilter: `blur(${px}px) saturate(150%)` } as ViewStyle) : {};

/** Frosted glass: translucent fill, light edge, and a real backdrop blur on web. */
export const glass: ViewStyle = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.glassEdge, ...blur(24) };

/** Glass for bars (tab bar, chat composer): darker so content scrolling under stays readable. */
export const glassBar: ViewStyle = { backgroundColor: colors.bar, ...blur(20) };

export const fonts = {
  display: 'InstrumentSans_700Bold',
  displayBold: 'InstrumentSans_700Bold',
  body: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
};

/** Type scale: bold, tight headings and plain, airy body copy. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12.5, letterSpacing: 0.75, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  sheet: 28,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
