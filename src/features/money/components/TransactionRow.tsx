import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Icon,
  Text,
  radii,
  spacing,
  useTheme,
  type ColorScheme,
  type IconName,
} from '@/design';
import { asPaise, formatMoney } from '@/lib/money';

import type { TransactionListItem } from '../api';

export type TransactionRowProps = {
  item: TransactionListItem;
  onLongPress: (item: TransactionListItem) => void;
};

/**
 * One line in the ledger.
 *
 * Memoised because the list re-renders on every committed write anywhere in the
 * app — saving a single transaction would otherwise re-render every visible
 * row. The default shallow comparison is enough here: `useLiveQuery` returns a
 * fresh array on each run, but `onLongPress` is a stable callback and `item`
 * only differs for rows whose data actually changed.
 */
export const TransactionRow = memo(function TransactionRow({
  item,
  onLongPress,
}: TransactionRowProps) {
  const theme = useTheme();

  const isIncome = item.type === 'income';
  const tint = resolveColorToken(item.categoryColorToken, theme.colors);

  // Signed at the point of display only. Storage keeps amounts positive and
  // puts direction in `type` — see ADR 0006.
  const amountColor = isIncome ? theme.colors.positive : theme.colors.text;
  const prefix = isIncome ? '+' : '−';

  return (
    <Pressable
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${item.categoryName ?? 'Uncategorised'}, ${formatMoney(asPaise(item.amount))}`}
      accessibilityHint="Hold for repeat and delete"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={[styles.iconWell, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon
          name={(item.categoryIcon ?? 'ellipse-outline') as IconName}
          size={17}
          color={tint}
        />
      </View>

      <View style={styles.text}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {item.categoryName ?? 'Uncategorised'}
        </Text>
        {item.note ? (
          <Text variant="label" color="textMuted" numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>

      <Text variant="bodyMedium" numeric style={{ color: amountColor }}>
        {prefix}
        {formatMoney(asPaise(item.amount), { symbol: false })}
      </Text>
    </Pressable>
  );
});

/**
 * Categories store a token name, not a hex value, so a theme change recolours
 * them automatically. An unknown or missing token falls back rather than
 * throwing — a category introduced by a future migration must never be able to
 * crash the ledger.
 */
function resolveColorToken(
  token: string | null,
  colors: ColorScheme,
): keyof ColorScheme {
  if (token !== null && token in colors) return token as keyof ColorScheme;
  return 'textMuted';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
});
