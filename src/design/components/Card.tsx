import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme';
import { radii, spacing } from '../tokens';

export type CardProps = ViewProps & {
  padding?: keyof typeof spacing;
  /** `surfaceAlt` for a card nested inside another card. */
  tone?: 'surface' | 'surfaceAlt';
  elevated?: boolean;
  bordered?: boolean;
};

/**
 * A raised surface.
 *
 * On dark themes the border does most of the work: a drop shadow against a
 * near-black background is invisible, so depth has to come from a lighter
 * hairline instead. Both are applied and each carries the weight in the theme
 * where it reads.
 */
export function Card({
  padding = 'lg',
  tone = 'surface',
  elevated = false,
  bordered = true,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  return (
    <View
      {...rest}
      style={[
        styles.base,
        {
          backgroundColor: theme.colors[tone],
          padding: spacing[padding],
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.border,
        },
        elevated && theme.elevation.medium,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
});
