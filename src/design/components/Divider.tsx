import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { spacing } from '../tokens';

export type DividerProps = {
  /** Left inset, to align the rule with text rather than the card edge. */
  inset?: keyof typeof spacing;
  spacingY?: keyof typeof spacing;
};

export function Divider({ inset = 'none', spacingY = 'none' }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
        marginLeft: spacing[inset],
        marginVertical: spacing[spacingY],
      }}
    />
  );
}
