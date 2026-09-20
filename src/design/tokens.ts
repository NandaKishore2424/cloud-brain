/**
 * Design tokens — the single source of truth for every visual constant.
 *
 * Rule: no component may hardcode a colour, spacing, radius or font size.
 * If a value is missing here, add it here. This is what makes a redesign a
 * one-file change instead of a week of grepping.
 *
 * Every foreground/background pair this palette produces is verified against
 * WCAG 2.1 by `npm run check:contrast`, which runs inside `npm run verify`.
 * See docs/decisions/0011-colour-system.md for the reasoning behind the hues
 * and the measurements that drove the specific values.
 */

/* ------------------------------------------------------------------ */
/* Palette — raw colour values. Never consumed directly by components. */
/* ------------------------------------------------------------------ */

const palette = {
  /**
   * Neutral ramp, very slightly cool.
   *
   * The tint is deliberate: a pure-grey neutral next to a blue accent reads as
   * faintly yellow by simultaneous contrast. A few degrees of blue in the greys
   * makes the surface feel intentional rather than washed.
   */
  neutral0: '#FFFFFF',
  neutral25: '#FBFCFD',
  neutral50: '#F6F7F9',
  neutral100: '#EEF0F4',
  neutral150: '#E3E6EC',
  neutral200: '#D1D6DE',
  neutral300: '#AEB5C0',
  neutral400: '#8A929E',
  neutral500: '#6E7683',
  neutral600: '#565E6B',
  neutral700: '#3E4552',
  neutral750: '#2E343E',
  neutral800: '#23272F',
  neutral850: '#1A1D23',
  /**
   * Dark theme background. NOT pure black, and not near-black.
   *
   * Material's guidance is around #121212. Pure black under light text causes
   * halation — the text appears to bleed at its edges — which is materially
   * worse for readers with astigmatism, and the extreme contrast is tiring over
   * a long session. The previous value here was #0B0D11, dark enough to cause
   * it.
   */
  neutral900: '#14161A',
  neutral950: '#0E1013',

  /**
   * Accent — blue.
   *
   * Blue is the colour most consistently associated with sustained focus and
   * calm in the workplace-colour literature, and it is also the conventional
   * platform signal for "interactive". Both matter for an app used daily at
   * work: the second reason is the more reliable one.
   *
   * The dark-theme value is not the light one rotated — it is deliberately
   * lighter and less saturated, because saturated colour on a dark surface
   * optically vibrates and cannot reach a readable contrast ratio.
   */
  blue300: '#A8CBF9',
  blue400: '#8FBCF5',
  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  blue800: '#1E3A8A',

  /**
   * Money-positive. Green — the other colour the literature ties to calm, and
   * the universal convention for money coming in.
   */
  green300: '#8FE8C0',
  green400: '#5FE3A8',
  green600: '#059669',
  green700: '#04704F',

  /**
   * Money-negative and destructive. Rose rather than pure red: recording an
   * expense is a normal daily act, not an error, and full-strength red makes an
   * ordinary ledger feel like a list of mistakes.
   */
  rose300: '#FDA4AF',
  rose400: '#FB8A9C',
  rose600: '#E11D48',
  rose700: '#B3103A',

  /**
   * Warning. Amber is the hardest hue to make accessible on white — the
   * readable version is much darker than it intuitively should be.
   */
  amber400: '#FBBF24',
  amber600: '#D97706',
  amber700: '#9A4C09',
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
  /** Hairlines and dividers. Decorative; not held to a contrast target. */
  border: string;
  /** Load-bearing border — focused inputs. Held to 3:1. */
  borderStrong: string;

  /** Primary reading text. */
  text: string;
  /** Supporting text — labels, metadata. Held to 4.5:1. */
  textMuted: string;
  /** De-emphasised text — captions, placeholders. Held to 3:1. */
  textSubtle: string;
  /** Text on top of an accent-filled surface. */
  textOnAccent: string;

  accent: string;
  accentPressed: string;
  /** Low-opacity accent wash for selected chips. */
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
  borderStrong: palette.neutral500,

  text: palette.neutral900,
  textMuted: palette.neutral600,
  textSubtle: palette.neutral500,
  textOnAccent: palette.neutral0,

  accent: palette.blue700,
  accentPressed: palette.blue800,
  accentSoft: 'rgba(29, 78, 216, 0.10)',

  positive: palette.green700,
  positiveSoft: 'rgba(4, 112, 79, 0.10)',
  negative: palette.rose700,
  negativeSoft: 'rgba(179, 16, 58, 0.10)',
  warning: palette.amber700,

  scrim: 'rgba(14, 16, 19, 0.45)',
};

export const darkColors: ColorScheme = {
  bg: palette.neutral900,
  surface: palette.neutral850,
  surfaceAlt: palette.neutral800,
  border: palette.neutral750,
  borderStrong: palette.neutral400,

  text: palette.neutral50,
  textMuted: palette.neutral300,
  textSubtle: palette.neutral400,
  /**
   * DARK text on the accent fill, not white.
   *
   * The dark theme's accent is a light blue, so a white label on it measures
   * around 3:1 — below the body-text target. Flipping the label to near-black
   * is the accessible answer, and it is what Material 3 does with
   * primary/onPrimary across themes. It reads as wrong written down and
   * correct on screen.
   */
  textOnAccent: palette.neutral950,

  accent: palette.blue400,
  accentPressed: palette.blue300,
  accentSoft: 'rgba(143, 188, 245, 0.16)',

  positive: palette.green400,
  positiveSoft: 'rgba(95, 227, 168, 0.15)',
  negative: palette.rose400,
  negativeSoft: 'rgba(251, 138, 156, 0.15)',
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
 * A deliberately small type scale. Seven sizes is enough for an app this size;
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
