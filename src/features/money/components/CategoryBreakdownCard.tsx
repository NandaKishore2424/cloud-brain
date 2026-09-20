import { StyleSheet, View } from 'react-native';

import {
  Card,
  Icon,
  Text,
  radii,
  spacing,
  useTheme,
  type ColorScheme,
  type IconName,
} from '@/design';
import { asPaise, formatMoney } from '@/lib/money';

import type { CategoryTotalRow } from '../api';
import type { CategoryBreakdown } from '../hooks';

export type CategoryBreakdownCardProps = {
  breakdown: CategoryBreakdown;
};

/** Rows past this are folded into an "Other" line. */
const VISIBLE_ROWS = 5;

/**
 * Where the month's money went.
 *
 * Proportion bars rather than a pie chart. A pie makes comparing adjacent
 * slices genuinely hard — angle is a poor visual encoding for magnitude — and
 * it wastes a lot of vertical space to show the same numbers. Bars share a
 * common baseline, so ranking is readable at a glance.
 *
 * Bars are scaled against the largest category, not the total. Scaling against
 * the total means that when one category dominates, every other bar collapses
 * to an unreadable sliver.
 */
export function CategoryBreakdownCard({ breakdown }: CategoryBreakdownCardProps) {
  const { rows, max, total } = breakdown;

  if (rows.length === 0) return null;

  const visible = rows.slice(0, VISIBLE_ROWS);
  const remainder = rows.slice(VISIBLE_ROWS);
  const remainderTotal = remainder.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.header}>
        <Text variant="heading">Where it went</Text>
        <Text variant="caption" color="textSubtle">
          {rows.length} {rows.length === 1 ? 'CATEGORY' : 'CATEGORIES'}
        </Text>
      </View>

      <View style={styles.rows}>
        {visible.map((row) => (
          <BreakdownRow
            key={row.categoryId ?? 'uncategorised'}
            row={row}
            max={max}
            total={total}
          />
        ))}

        {remainder.length > 0 ? (
          <View style={styles.remainder}>
            <Text variant="label" color="textSubtle">
              +{remainder.length} more
            </Text>
            <Text variant="label" color="textSubtle" numeric>
              {formatMoney(asPaise(remainderTotal))}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

type BreakdownRowProps = {
  row: CategoryTotalRow;
  max: number;
  total: number;
};

function BreakdownRow({ row, max, total }: BreakdownRowProps) {
  const theme = useTheme();

  // `max` is guaranteed > 0 here: the card returns early on an empty list, and
  // every transaction amount has a CHECK (amount > 0) constraint.
  const fill = Math.max(row.total / max, 0.02);
  const share = total > 0 ? Math.round((row.total / total) * 100) : 0;
  const tint = resolveColorToken(row.categoryColorToken, theme.colors);

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowLabel}>
          <Icon
            name={(row.categoryIcon ?? 'ellipse-outline') as IconName}
            size={14}
            color={tint}
          />
          <Text variant="body" numberOfLines={1}>
            {row.categoryName ?? 'Uncategorised'}
          </Text>
        </View>

        <View style={styles.rowValues}>
          <Text variant="bodyMedium" numeric>
            {formatMoney(asPaise(row.total))}
          </Text>
          <Text variant="caption" color="textSubtle" numeric>
            {share}%
          </Text>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View
          style={[
            styles.fill,
            { width: `${fill * 100}%`, backgroundColor: theme.colors[tint] },
          ]}
        />
      </View>
    </View>
  );
}

function resolveColorToken(
  token: string | null,
  colors: ColorScheme,
): keyof ColorScheme {
  if (token !== null && token in colors) return token as keyof ColorScheme;
  return 'accent';
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  rows: { gap: spacing.md },
  row: { gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  rowValues: { alignItems: 'flex-end' },
  track: { height: 5, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
  remainder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
});
