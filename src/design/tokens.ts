/**
 * Design tokens — the single source of truth for every visual constant.
 *
 * Rule: no component may hardcode a colour, spacing, radius or font size.
 * If a value is missing here, add it here. This is what makes a redesign a
 * one-file change instead of a week of grepping.
 *
 * See docs/decisions/0003-no-styling-library.md for why this is hand-rolled.
 */

/* ------------------------------------------------------------------ */
/* Palette — raw colour values. Never consumed directly by components. */
/* ------------------------------------------------------------------ */

const palette = {
  // Cool neutral ramp. 0 = lightest, 950 = darkest.
  neutral0: '#FFFFFF',
  neutral25: '#FCFCFD',
  neutral50: '#F7F8FA',
  neutral100: '#EFF1F5',
  neutral150: '#E4E7EC',
  neutral200: '#D3D8E0',
  neutral300: '#B4BBC7',
  neutral400: '#8C95A5',
  neutral500: '#6B7382',
  neutral600: '#515865',
  neutral700: '#3A404B',
  neutral750: '#2C313A',
  neutral800: '#212630',
  neutral850: '#191D25',
  neutral900: '#12151B',
  neutral950: '#0B0D11',

  // Accent — indigo. Confident, not playful. Reads well on both themes.
  indigo300: '#A5B4FC',
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',

  // Money-positive. Emerald, deliberately desaturated so it is not "casino green".
  emerald300: '#6EE7B7',
  emerald400: '#34D399',
  emerald500: '#10B981',
  emerald600: '#059669',

  // Money-negative / destructive. Rose rather than red — less alarming for the
  // common case of simply recording an expense.
  rose300: '#FDA4AF',
  rose400: '#FB7185',
  rose500: '#F43F5E',
  rose600: '#E11D48',

  amber400: '#FBBF24',
  amber500: '#F59E0B',
} as const;

/* ------------------------------------------------------------------ */
/* Semantic colour schemes                                             */
/* ------------------------------------------------------------------ */

export type ColorScheme = {
  /** App background, furthest back. */
  bg: string;
  /** Raised surface — cards, sheets, inputs. */
  surface: string;
  /** Surface one step above `surface` (nested cards, pressed states). */
  surfaceAlt: string;
  /** Hairlines and dividers. */
  border: string;
  /** Stronger border — focused inputs. */
  borderStrong: string;

  /** Primary reading text. */
  text: string;
  /** Supporting text — labels, metadata. */
  textMuted: string;
  /** De-emphasised text — placeholders, disabled. */
  textSubtle: string;
  /** Text on top of an accent-filled surface. */
  textOnAccent: string;

  accent: string;
  accentPressed: string;
  /** Low-opacity accent wash for selected chips/backgrounds. */
  accentSoft: string;

  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;

  /** Scrim behind modals. */
  scrim: string;
};

export const lightColors: ColorScheme = {
  bg: palette.neutral50,
  surface: palette.neutral0,
  surfaceAlt: palette.neutral100,
  border: palette.neutral150,
  borderStrong: palette.neutral300,

  text: palette.neutral900,
  textMuted: palette.neutral500,
  textSubtle: palette.neutral400,
  textOnAccent: palette.neutral0,

  accent: palette.indigo600,
  accentPressed: palette.indigo700,
  accentSoft: 'rgba(79, 70, 229, 0.10)',

  positive: palette.emerald600,
  positiveSoft: 'rgba(5, 150, 105, 0.10)',
  negative: palette.rose600,
  negativeSoft: 'rgba(225, 29, 72, 0.10)',
  warning: palette.amber500,

  scrim: 'rgba(11, 13, 17, 0.45)',
};

export const darkColors: ColorScheme = {
  bg: palette.neutral950,
  surface: palette.neutral850,
  surfaceAlt: palette.neutral800,
  border: palette.neutral800,
  borderStrong: palette.neutral700,

  text: palette.neutral50,
  textMuted: palette.neutral400,
  textSubtle: palette.neutral500,
  textOnAccent: palette.neutral0,

  accent: palette.indigo400,
  accentPressed: palette.indigo300,
  accentSoft: 'rgba(129, 140, 248, 0.16)',

  positive: palette.emerald400,
  positiveSoft: 'rgba(52, 211, 153, 0.14)',
  negative: palette.rose400,
  negativeSoft: 'rgba(251, 113, 133, 0.14)',
  warning: palette.amber400,

  scrim: 'rgba(0, 0, 0, 0.6)',
};

/* ------------------------------------------------------------------ */
/* Spacing — 4pt base grid.                                            */
/* ------------------------------------------------------------------ */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export type SpacingKey = keyof typeof spacing;

/* ------------------------------------------------------------------ */
/* Radii                                                               */
/* ------------------------------------------------------------------ */

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  pill: 999,
} as const;

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * A deliberately small type scale. Six sizes is enough for an app this size;
 * more sizes means less consistency, not more expressiveness.
 *
 * `display` exists for one job: the big balance number.
 */
export const typography = {
  display: { fontSize: 40, lineHeight: 46, family: fontFamily.bold, letterSpacing: -1.2 },
  title: { fontSize: 26, lineHeight: 32, family: fontFamily.bold, letterSpacing: -0.6 },
  heading: { fontSize: 19, lineHeight: 25, family: fontFamily.semibold, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21, family: fontFamily.regular, letterSpacing: -0.1 },
  bodyMedium: { fontSize: 15, lineHeight: 21, family: fontFamily.medium, letterSpacing: -0.1 },
  label: { fontSize: 13, lineHeight: 18, family: fontFamily.medium, letterSpacing: 0 },
  caption: { fontSize: 11, lineHeight: 15, family: fontFamily.medium, letterSpacing: 0.3 },
} as const;

export type TypographyVariant = keyof typeof typography;

/* ------------------------------------------------------------------ */
/* Elevation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Android ignores iOS shadow props and uses `elevation`, so both are set.
 * Kept shallow on purpose — heavy drop shadows read as dated.
 */
export const elevation = {
  none: { elevation: 0, shadowOpacity: 0 },
  low: {
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  medium: {
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  high: {
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
} as const;

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/**
 * Durations are short by design. Anything over ~250ms on a utility app starts
 * to feel like waiting rather than responding.
 */
export const motion = {
  instant: 90,
  fast: 150,
  normal: 220,
  slow: 320,
  /** Spring config for press feedback — critically damped, no visible bounce. */
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  /** Spring for entering surfaces — a touch of overshoot reads as responsive. */
  enter: { damping: 20, stiffness: 220, mass: 0.8 },
} as const;

/** Minimum tappable area. Android accessibility guidance is 48dp. */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH_TARGET = 48;
