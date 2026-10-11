import { Platform, ViewStyle } from 'react-native';

// Tokens taken from the BACI design canvas (Claude Design), with frosted-glass surfaces.
export const colors = {
  // Fallback behind the gradient backdrop (assets/backdrop.jpg).
  ground: '#E9EFE6',
  /** Frosted glass: translucent white over the green gradient. */
  surface: 'rgba(255,255,255,0.58)',
  /** Brighter glass for dialogs and bars over moving content. */
  sheet: 'rgba(255,255,255,0.86)',
  /** The bright edge that makes glass read as glass. */
  glassEdge: 'rgba(255,255,255,0.78)',
  ink: '#16181D',
  inkSoft: '#454A54',
  muted: '#5B606B',
  primary: '#0F5C4C',
  primaryPressed: '#0B4A3D',
  primaryTint: '#E3EFE9',
  ringOuter: '#B9CFC7',
  ringInner: '#8FB3A7',
  border: '#E1DDD3',
  hairline: '#EFECE5',
  control: '#C9C4B8',
  chipLine: '#8E8A82',
  toggleOff: '#9A968B',
  stepIdle: '#E4E1D8',
  track: '#EFECE5',
  disabled: '#D7D3CA',

  successBg: '#E2F1E8',
  successFg: '#1D6B45',
  warnBg: '#FBEFD9',
  warnFg: '#8A5100',
  warnInk: '#5E3700',
  dangerBg: '#FBE6E3',
  dangerFg: '#B42318',
  dangerInk: '#7A1911',
  infoBg: '#E5EBF5',
  infoFg: '#2F4B7C',
  infoInk: '#1F365C',
  accent: '#A84F1F',
};

/** Frosted glass: translucent fill, bright hairline edge, and a real backdrop blur on web. */
export const glass: ViewStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.glassEdge,
  ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' } as object) : null),
};

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
};

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  pill: 999,
};
