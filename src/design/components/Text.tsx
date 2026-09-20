import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorScheme, TypographyVariant } from '../tokens';

export type TextColor = keyof ColorScheme;

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /**
   * Render digits with fixed advance width (tabular figures).
   *
   * Use for anything that appears in a column of numbers — amounts, dates,
   * counts. With proportional figures a '1' is narrower than a '0', so a
   * right-aligned column of amounts visibly shimmers as values change. This is
   * the single highest-impact typography detail in a finance app.
   */
  numeric?: boolean;
};

/**
 * The only text component in the app.
 *
 * React Native's bare `<Text>` is never imported directly by feature code: it
 * has no default font, no default colour, and no connection to the type scale,
 * so every usage becomes an opportunity to drift. This wrapper makes the
 * default correct and the scale the path of least resistance.
 */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  numeric = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const spec = theme.typography[variant];

  return (
    <RNText
      {...rest}
      // Respect the OS font-size setting, but cap the multiplier: past ~1.3x a
      // dense list layout stops fitting and rows start clipping.
      maxFontSizeMultiplier={1.3}
      style={[
        {
          fontFamily: spec.family,
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.letterSpacing,
          color: theme.colors[color],
          textAlign: align,
          ...(numeric ? { fontVariant: ['tabular-nums' as const] } : null),
        },
        style,
      ]}
    />
  );
}
